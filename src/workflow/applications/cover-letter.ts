/**
 * Core orchestrator for the `jho cover-letter` workflow. Follows the
 * same pattern as `core/track/track.ts`: all business logic lives here,
 * the CLI is a thin wrapper that parses options and catches errors.
 *
 * This module is reusable from both the CLI and the MCP server.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { getConfig } from '../../core/config/config.js';
import { defaultLlmConfig, chatComplete } from '../../core/llm.js';
import { loadPromptTemplateWithVoice } from '../../core/prompts.js';
import { humanize } from '../../core/humanize.js';
import { readProfile } from '../../workflow/campaign/profile-read.js';
import {
  JOB_DESCRIPTION_SECTION_HEADER,
  CANDIDATE_PROFILE_SECTION_HEADER,
  TARGET_ROLE_SECTION_HEADER,
  KNOWLEDGE_BASE_SECTION_HEADER,
  ADDITIONAL_INSTRUCTIONS_SECTION_HEADER,
  SECTION_SEPARATOR,
} from '../../core/constants.js';
import { resolveVoiceGuide, appendVoiceSection } from '../../workflow/campaign/voice-read.js';
import { extractTargetRoles } from '../../workflow/campaign/target-roles.js';
import { readApplication } from './applications.js';
import { replaceRegion, extractSteer, replaceSteer } from '../../core/parser/markers.js';
import { loadKbContextForCampaign } from '../../workflow/campaign/kb-context.js';
import { atomicWrite } from '../../core/fs.js';
import { acquireLock } from '../../core/locks.js';
import { extractJdContent, isRefusal, countWords } from '../../core/generation-utils.js';
import { computeHash, writeToolhash } from '../../core/toolhash.js';
import type { CoverLetterOptions, CoverLetterResult } from '../../core/types.js';

/** Prompt template name (without `.md`). */
const PROMPT_NAME = 'cover-letter';

import { CoverLetterError, CoverLetterReadError } from './cover-letter-errors.js';
export { CoverLetterError, CoverLetterReadError } from './cover-letter-errors.js';

/**
 * Generate a tailored cover letter for an application. Reads the
 * application's JD and the candidate's profile, calls the LLM,
 * and returns the generated content.
 *
 * @returns The generated cover letter content and metadata.
 * @throws {CoverLetterError} on generation failure.
 */
export async function generateCoverLetter(opts: CoverLetterOptions): Promise<CoverLetterResult> {
  const { slug, campaign, log } = opts;

  const campaignRoot = resolveCampaignRoot(campaign);
  const appliedDir = resolveAppliedDir(campaignRoot);

  // Read application
  let app;
  try {
    app = await readApplication(appliedDir, slug);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CoverLetterError(`Failed to read application: ${msg}`);
  }

  const { frontmatter } = app;

  // Read JD from jd.md
  const appFolder = join(appliedDir, slug);
  let jdContent: string;
  try {
    jdContent = await readFile(join(appFolder, 'jd.md'), 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CoverLetterError(`Failed to read JD: ${msg}`);
  }
  const jdText = extractJdContent(jdContent);

  // Read profile
  let profile: string;
  try {
    profile = await readProfile(campaignRoot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CoverLetterError(`Failed to read profile: ${msg}`);
  }

  // Parse target roles and find the matching one
  const targetRoles = extractTargetRoles(profile);
  const matchedRole = frontmatter.targetRole
    ? targetRoles.find((r) => r.slug === frontmatter.targetRole)
    : undefined;

  // Build role summary for the prompt
  let roleSummary = 'No target role assigned.';
  if (matchedRole) {
    roleSummary = [
      `Title: ${matchedRole.title} [${matchedRole.priority}]`,
      `Level: ${matchedRole.level}`,
      `Domain: ${matchedRole.domain}`,
      `Stack: ${matchedRole.stack}`,
      `Work style: ${matchedRole.workStyle}`,
      `Compensation: ${matchedRole.compensation}`,
      `Notes: ${matchedRole.notes}`,
    ].join('\n');
  }

  // Read existing cover-letter.md to extract stored steer
  const coverLetterPath = join(appFolder, 'cover-letter.md');
  const existingCoverLetter = await readFile(coverLetterPath, 'utf8').catch(() => '');
  const existingSteer = extractSteer(existingCoverLetter);

  // Use provided steer or fall back to existing steer
  const steer = opts.steer ?? existingSteer;

  // Read personal voice guide if available
  const voice = await resolveVoiceGuide(campaignRoot);

  // Load prompt (with shared humanize voice block)
  const { body: systemPrompt, temperature } = await loadPromptTemplateWithVoice(
    PROMPT_NAME,
    'humanize-voice',
  );

  // Build user message
  const messageParts = [
    JOB_DESCRIPTION_SECTION_HEADER,
    '',
    `Title: ${frontmatter.title}`,
    `Company: ${frontmatter.company}`,
    `Location: ${frontmatter.location}`,
    '',
    jdText,
    '',
    SECTION_SEPARATOR,
    '',
    CANDIDATE_PROFILE_SECTION_HEADER,
    '',
    profile,
    '',
    SECTION_SEPARATOR,
    '',
    TARGET_ROLE_SECTION_HEADER,
    '',
    roleSummary,
  ];

  // Feed user knowledge-base docs into the prompt (always-on; see kb-context).
  const kb = await loadKbContextForCampaign(campaignRoot, campaign);
  if (kb) {
    messageParts.push('', SECTION_SEPARATOR, '', KNOWLEDGE_BASE_SECTION_HEADER, '', kb);
  }

  // Feed personal voice guide into the prompt when available
  appendVoiceSection(messageParts, voice);

  // Add steer section if present
  if (steer) {
    messageParts.push(
      '',
      SECTION_SEPARATOR,
      '',
      ADDITIONAL_INSTRUCTIONS_SECTION_HEADER,
      '',
      'Follow these instructions as priority:',
      '',
      steer,
    );
  }

  const userMessage = messageParts.join('\n');

  // Call LLM
  let result;
  try {
    const { global } = getConfig(campaign);
    const llmConfig = defaultLlmConfig(global);
    result = await chatComplete(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      llmConfig,
      { temperature },
      log,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CoverLetterError(`LLM call failed: ${msg}`);
  }

  const content = result.content.trim();

  // Mechanical humanize pass (em-dash chains, stretched whitespace, smart
  // quotes). Runs before the refusal check so refusals are left intact.
  const cleaned = humanize(content);

  // Check for refusal
  if (isRefusal(cleaned)) {
    throw new CoverLetterError('LLM refused to generate cover letter');
  }

  // Write to cover-letter.md (skip if noSave)
  if (!opts.noSave) {
    await acquireLock(appFolder, async () => {
      let fileContent = await readFile(coverLetterPath, 'utf8').catch(() => '');
      fileContent = replaceRegion(fileContent, 'cover-letter', cleaned, {
        createIfMissing: true,
      });

      // Write steer marker if steer was provided (overwrites existing)
      if (opts.steer !== undefined) {
        fileContent = replaceSteer(fileContent, opts.steer);
      }

      const written = await atomicWrite(coverLetterPath, fileContent);
      if (!written) {
        throw new CoverLetterError(`Failed to write cover-letter.md`);
      }

      // Write toolhash sidecar for cover-letter.md
      await writeToolhash(coverLetterPath, computeHash(fileContent));
    });
  }

  log?.info(
    { slug, model: result.model, wordCount: countWords(cleaned), durationMs: result.durationMs },
    'cover-letter.generated',
  );

  return {
    content: cleaned,
    wordCount: countWords(cleaned),
    model: result.model,
    durationMs: result.durationMs,
  };
}

/**
 * Read an existing cover letter for an application.
 *
 * @param campaign - Campaign name.
 * @param slug - Application slug.
 * @returns The cover letter content.
 * @throws {CoverLetterReadError} if the file cannot be read.
 */
export async function readCoverLetter(campaign: string, slug: string): Promise<string> {
  const campaignRoot = resolveCampaignRoot(campaign);
  const appliedDir = resolveAppliedDir(campaignRoot);
  const coverLetterPath = join(appliedDir, slug, 'cover-letter.md');

  try {
    return await readFile(coverLetterPath, 'utf8');
  } catch {
    throw new CoverLetterReadError(
      `No cover letter found for "${slug}".\nGenerate one with: jho cover-letter ${slug}`,
    );
  }
}
