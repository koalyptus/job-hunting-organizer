/**
 * Core orchestrator for the `jho cover-letter` workflow. Follows the
 * same pattern as `core/track/track.ts`: all business logic lives here,
 * the CLI is a thin wrapper that parses options and catches errors.
 *
 * This module is reusable from both the CLI and the MCP server.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveCampaignRoot, resolveAppliedDir } from '../paths.js';
import { getConfig } from '../config/config.js';
import { defaultLlmConfig, chatComplete } from '../llm.js';
import { loadPromptTemplate } from '../prompts.js';
import { readProfile } from '../campaign/profile.js';
import { extractTargetRoles } from '../campaign/target-roles.js';
import { readApplication } from './applications.js';
import { replaceRegion, extractSteer, replaceSteer } from '../parser/markers.js';
import { atomicWrite } from '../fs.js';
import { acquireLock } from '../locks.js';
import { extractJdContent, isRefusal, countWords } from '../generation-utils.js';
import { computeHash, writeToolhash } from '../toolhash.js';
import type { CoverLetterOptions, CoverLetterResult } from '../types.js';

/** Prompt template name (without `.md`). */
const PROMPT_NAME = 'cover-letter';

/**
 * Thrown when the cover letter generation fails.
 */
export class CoverLetterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoverLetterError';
  }
}

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

  // Load prompt
  const { body: systemPrompt, temperature } = await loadPromptTemplate(PROMPT_NAME);

  // Build user message
  const messageParts = [
    '## Job description',
    '',
    `Title: ${frontmatter.title}`,
    `Company: ${frontmatter.company}`,
    `Location: ${frontmatter.location}`,
    '',
    jdText,
    '',
    '---',
    '',
    '## Candidate profile',
    '',
    profile,
    '',
    '---',
    '',
    '## Target role',
    '',
    roleSummary,
  ];

  // Add steer section if present
  if (steer) {
    messageParts.push(
      '',
      '---',
      '',
      '## Additional instructions',
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

  // Check for refusal
  if (isRefusal(content)) {
    throw new CoverLetterError('LLM refused to generate cover letter');
  }

  // Write to cover-letter.md (skip if noSave)
  if (!opts.noSave) {
    await acquireLock(appFolder, async () => {
      let fileContent = await readFile(coverLetterPath, 'utf8').catch(() => '');
      fileContent = replaceRegion(fileContent, 'cover-letter', content, {
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
    { slug, model: result.model, wordCount: countWords(content), durationMs: result.durationMs },
    'cover-letter.generated',
  );

  return {
    content,
    wordCount: countWords(content),
    model: result.model,
    durationMs: result.durationMs,
  };
}

/**
 * Thrown when the cover letter cannot be read.
 */
export class CoverLetterReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoverLetterReadError';
  }
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
