/**
 * Core orchestrator for the `jho retro` workflow. Follows the same
 * read→LLM→write append pattern as `core/applications/application-qa.ts`.
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
import { readApplication } from '../applications/applications.js';
import { atomicWrite, pathExists } from '../fs.js';
import { acquireLock } from '../locks.js';
import { extractSteer, replaceSteer } from '../parser/markers.js';
import { loadKbContextForCampaign } from '../campaign/kb-context.js';
import { extractJdContent, isRefusal, countWords } from '../generation-utils.js';
import { computeHash, writeToolhash } from '../toolhash.js';
import { moduleLogger } from '../logger/logger.js';
import type { Logger } from 'pino';
import type {
  RetroSection,
  WeakTopic,
  StartRetroInput,
  StartRetroResult,
  AppendRetroOptions,
} from './types.js';

const log = moduleLogger(import.meta.url);

const PROMPT_NAME = 'learning-plan';

const RETRO_MARKER =
  '<!-- jho:retro — post-mortem for failed interviews. Tool appends a new H2 per retro; never overwrites prior retros. -->';

const H2_PATTERN = /^## (.+)$/;
const RETRO_HEADING_PATTERN = /^Retro for interview: (.+?) — (.+?) \[(.+?)\]$/;
const FIELD_PATTERN = /^- ([\w -]+):\s*(.*)$/;
const WEAK_TOPIC_PATTERN = /^- (.+?)(?: — (.+))?$/;
const H3_PATTERN = /^### (.+)$/;

import { RetroError, RetroNotFoundError } from './retro-errors.js';
export { RetroError, RetroNotFoundError } from './retro-errors.js';

/**
 * Parse the H2 heading line into its three components.
 */
function parseRetroHeading(
  heading: string,
): { when: string; title: string; status: string } | null {
  const match = heading.match(RETRO_HEADING_PATTERN);
  if (!match) {
    return null;
  }
  return { when: match[1]!, title: match[2]!, status: match[3]! };
}

/**
 * Parse field lines from the metadata block of a retro section.
 */
function parseField(line: string): { key: string; value: string } | null {
  const fieldMatch = line.match(FIELD_PATTERN);
  if (!fieldMatch) {
    return null;
  }
  return { key: fieldMatch[1]!, value: fieldMatch[2]! };
}

/**
 * Parse all retro sections from `retro.md` content.
 * Returns entries in document order.
 */
export function parseRetroFile(content: string): RetroSection[] {
  const lines = content.split('\n');
  const sections: RetroSection[] = [];
  let currentHeading: string | null = null;
  let currentStartIndex = -1;
  let sectionCount = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const headingMatch = line.match(H2_PATTERN);
    if (headingMatch) {
      if (currentHeading !== null) {
        const body = lines.slice(currentStartIndex + 1, i);
        const section = parseRetroSection(currentHeading, body, sectionCount);
        if (section) {
          sections.push(section);
          sectionCount++;
        }
      }
      currentHeading = headingMatch[1]!;
      currentStartIndex = i;
    }
  }

  if (currentHeading !== null) {
    const body = lines.slice(currentStartIndex + 1);
    const section = parseRetroSection(currentHeading, body, sectionCount);
    if (section) {
      sections.push(section);
    }
  }

  return sections;
}

/**
 * Build a RetroSection from a parsed H2 heading and its body lines.
 */
function parseRetroSection(heading: string, body: string[], index: number): RetroSection | null {
  const headingData = parseRetroHeading(heading);
  if (!headingData) {
    return null;
  }

  const sectionData: {
    when: string;
    title: string;
    status: string;
    date: string;
    interviewId: number;
    statusAtTime: string;
    weakTopics: WeakTopic[];
    notes: string;
    body: string;
  } = {
    when: headingData.when,
    title: headingData.title,
    status: headingData.status,
    date: '',
    interviewId: 0,
    statusAtTime: '',
    weakTopics: [],
    notes: '',
    body: body.join('\n'),
  };

  let inWeakTopics = false;
  let inOtherNotes = false;
  const notesBuffer: string[] = [];
  for (const line of body) {
    const fieldEntry = parseField(line);
    if (fieldEntry) {
      switch (fieldEntry.key) {
        case 'Date':
          sectionData.date = fieldEntry.value;
          break;
        case 'Interview id':
          sectionData.interviewId = parseInt(fieldEntry.value, 10) || 0;
          break;
        case 'Status at the time':
          sectionData.statusAtTime = fieldEntry.value;
          break;
      }
    }

    const h3Match = line.match(H3_PATTERN);
    if (h3Match) {
      inWeakTopics = h3Match[1] === 'Weak topics';
      inOtherNotes = h3Match[1] === 'Other notes';
    } else if (inWeakTopics && line.startsWith('- ')) {
      const weakTopic = line.match(WEAK_TOPIC_PATTERN);
      if (weakTopic) {
        sectionData.weakTopics.push({
          topic: weakTopic[1]!,
          detail: weakTopic[2] ?? '',
        });
      }
    } else if (inOtherNotes) {
      notesBuffer.push(line);
    }
  }
  if (notesBuffer.length > 0) {
    sectionData.notes = notesBuffer.join('\n').trim();
  }

  return {
    index: index,
    when: sectionData.when,
    title: sectionData.title,
    status: sectionData.status,
    date: sectionData.date,
    interviewId: sectionData.interviewId,
    statusAtTime: sectionData.statusAtTime,
    weakTopics: sectionData.weakTopics,
    notes: sectionData.notes,
    body: sectionData.body,
  };
}

/**
 * Build the full content of a new `retro.md` file.
 */
function buildNewFileContent(title: string, company: string, section: string): string {
  return [RETRO_MARKER, '', `# Post-mortem — ${title} @ ${company}`, '', section.trim(), ''].join(
    '\n',
  );
}

/**
 * Build the H2 section markdown for a retro entry, including metadata
 * fields and the raw generated learning plan body.
 */
function buildSection(
  when: string,
  interviewId: number | undefined,
  weakTopics: string[],
  notes: string | undefined,
  generatedPlan: string,
): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const status = 'failed';
  const title = interviewId !== undefined ? `Interview #${interviewId}` : 'Post-mortem';

  const lines: string[] = [
    `## Retro for interview: ${when} — ${title} [${status}]`,
    '',
    `- Date: ${dateStr}`,
    ...(interviewId !== undefined ? [`- Interview id: ${interviewId}`] : []),
    '- Status at the time: failed',
    '',
    '### Weak topics',
    '',
    ...weakTopics.map((topic) => `- ${topic}`),
  ];

  if (notes) {
    lines.push('', '### Other notes', '', notes);
  }

  lines.push('', '### Learning plan', '', generatedPlan.trim());

  return lines.join('\n');
}

/**
 * Generate a learning plan via LLM for given weak topics and application
 * context. Shared between {@link startRetro} and {@link appendRetro}.
 */
async function generateLearningPlan(
  slug: string,
  campaign: string,
  weakTopics: string[],
  steer: string | undefined,
  externalLog: Logger | undefined,
  frontmatter: { title: string; company: string; location: string },
): Promise<{ content: string; model: string; durationMs: number }> {
  const campaignRoot = resolveCampaignRoot(campaign);
  const appliedDir = resolveAppliedDir(campaignRoot);

  const appFolder = join(appliedDir, slug);
  let jdContent: string;
  try {
    jdContent = await readFile(join(appFolder, 'jd.md'), 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new RetroError(`Failed to read JD: ${msg}`);
  }
  const jdText = extractJdContent(jdContent);

  let profile: string;
  try {
    profile = await readProfile(campaignRoot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new RetroError(`Failed to read profile: ${msg}`);
  }

  const { body: systemPrompt, temperature } = await loadPromptTemplate(PROMPT_NAME);

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
    '## Weak topics',
    '',
    ...weakTopics.map((topic) => `- ${topic}`),
  ];

  // Feed user knowledge-base docs into the prompt (always-on; see kb-context).
  const kb = await loadKbContextForCampaign(campaignRoot, campaign);
  if (kb) {
    messageParts.push('', '---', '', '## Knowledge base', '', kb);
  }

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
      externalLog,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new RetroError(`LLM call failed: ${msg}`);
  }

  const content = result.content.trim();

  if (isRefusal(content)) {
    throw new RetroError('LLM refused to generate learning plan');
  }

  return { content, model: result.model, durationMs: result.durationMs };
}

/**
 * Start a new retro for an application: reads the application's JD and
 * profile, calls the LLM with weak topics, and appends the learning plan
 * to `retro.md`.
 *
 * @returns The generated plan content and metadata.
 * @throws {RetroError} on generation failure.
 * @throws {RetroNotFoundError} if the application doesn't exist.
 */
export async function startRetro(opts: StartRetroInput): Promise<StartRetroResult> {
  const { slug, campaign, weakTopics, notes, interviewId, steer, log: externalLog } = opts;
  const logger = externalLog ?? log;

  if (weakTopics.length === 0) {
    throw new RetroError('At least one weak topic is required');
  }

  const campaignRoot = resolveCampaignRoot(campaign);
  const appliedDir = resolveAppliedDir(campaignRoot);

  let app;
  try {
    app = await readApplication(appliedDir, slug);
  } catch (err) {
    if (err instanceof Error && err.name === 'ApplicationNotFoundError') {
      throw new RetroNotFoundError(slug);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new RetroError(`Failed to read application: ${msg}`);
  }

  const { title, company } = app.frontmatter;
  const appFolder = join(appliedDir, slug);
  const retroPath = join(appFolder, 'retro.md');

  // Read existing retro file to extract stored steer (if any)
  const existingRetroContent = await readFile(retroPath, 'utf8').catch(() => '');
  const existingSteer = extractSteer(existingRetroContent);

  // Use provided steer or fall back to existing steer from file
  const effectiveSteer = steer ?? existingSteer;

  // Generate the learning plan
  const plan = await generateLearningPlan(
    slug,
    campaign,
    weakTopics,
    effectiveSteer,
    externalLog,
    app.frontmatter,
  );

  const section = buildSection(
    new Date()
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d{3}Z$/, ''),
    interviewId,
    weakTopics,
    notes,
    plan.content,
  );

  return acquireLock(appFolder, async () => {
    const exists = await pathExists(retroPath);
    let fileContent: string;
    let sectionIndex = 1;

    if (!exists) {
      fileContent = buildNewFileContent(title, company, section);
    } else {
      const existingContent = await readFile(retroPath, 'utf8');
      const existing = parseRetroFile(existingContent);
      sectionIndex = existing.length + 1;
      fileContent = existingContent.trimEnd() + '\n\n' + section.trim() + '\n';
    }

    // Persist steer marker when explicitly provided
    if (steer !== undefined) {
      fileContent = replaceSteer(fileContent, steer);
    }

    const written = await atomicWrite(retroPath, fileContent);
    if (!written) {
      throw new RetroError(`Failed to write retro.md for ${slug}`);
    }

    // Write toolhash sidecar for retro.md
    await writeToolhash(retroPath, computeHash(fileContent));

    logger.info({ slug, retroIndex: sectionIndex }, 'retro.started');
    return {
      content: plan.content,
      wordCount: countWords(plan.content),
      model: plan.model,
      durationMs: plan.durationMs,
      index: sectionIndex,
    };
  });
}

/**
 * Append new weak topics to the last retro section and regenerate the
 * learning plan. Reads existing weak topics, merges with new ones (dedup
 * by line), calls the LLM, and replaces the last section's learning plan.
 *
 * @returns The regenerated plan content and metadata.
 * @throws {RetroError} if no retro exists or LLM call fails.
 */
export async function appendRetro(opts: AppendRetroOptions): Promise<StartRetroResult> {
  const {
    slug,
    campaign,
    weakTopics: additionalTopics,
    notes: incomingNotes,
    steer,
    log: externalLog,
  } = opts;
  const logger = externalLog ?? log;

  if (additionalTopics.length === 0) {
    throw new RetroError('At least one new weak topic is required');
  }

  const campaignRoot = resolveCampaignRoot(campaign);
  const appliedDir = resolveAppliedDir(campaignRoot);
  const appFolder = join(appliedDir, slug);
  const retroPath = join(appFolder, 'retro.md');

  // Read existing retro file for steer extraction (outside lock)
  let existingContent: string;
  try {
    existingContent = await readFile(retroPath, 'utf8');
  } catch {
    throw new RetroError(`No retro found for "${slug}".\nGenerate one with: jho retro ${slug}`);
  }

  const existingSteer = extractSteer(existingContent);
  const effectiveSteer = steer ?? existingSteer;

  let app;
  try {
    app = await readApplication(appliedDir, slug);
  } catch (err) {
    if (err instanceof Error && err.name === 'ApplicationNotFoundError') {
      throw new RetroNotFoundError(slug);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new RetroError(`Failed to read application: ${msg}`);
  }

  const sections = parseRetroFile(existingContent);
  if (sections.length === 0) {
    throw new RetroError(`No retro sections found for "${slug}"`);
  }

  const lastSection = sections[sections.length - 1]!;

  // Merge existing weak topic lines with new ones (dedup)
  const existingLabels = new Set(
    lastSection.weakTopics.map((weakTopic) =>
      weakTopic.detail ? `${weakTopic.topic} — ${weakTopic.detail}` : weakTopic.topic,
    ),
  );
  const combinedTopics = [
    ...lastSection.weakTopics.map((weakTopic) =>
      weakTopic.detail ? `${weakTopic.topic} — ${weakTopic.detail}` : weakTopic.topic,
    ),
    ...additionalTopics.filter((topic) => !existingLabels.has(topic)),
  ];

  const combinedNotes = [lastSection.notes, incomingNotes].filter(Boolean).join('\n').trim();

  // Regenerate learning plan with all weak topics (outside lock)
  const plan = await generateLearningPlan(
    slug,
    campaign,
    combinedTopics,
    effectiveSteer,
    externalLog,
    app.frontmatter,
  );

  // Rebuild and persist (inside lock)
  return acquireLock(appFolder, async () => {
    let content: string;
    try {
      content = await readFile(retroPath, 'utf8');
    } catch {
      throw new RetroError(`No retro found for "${slug}".\nGenerate one with: jho retro ${slug}`);
    }

    const currentSections = parseRetroFile(content);
    if (currentSections.length === 0) {
      throw new RetroError(`No retro sections found for "${slug}"`);
    }

    // Replace the last H2 section in the raw content
    const lines = content.split('\n');
    let sectionCount = 0;
    let sectionStartIndex = -1;
    let sectionEndIndex = lines.length;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i]!.match(H2_PATTERN);
      if (match) {
        sectionCount++;
        if (sectionCount === currentSections.length) {
          sectionStartIndex = i;
        } else if (sectionCount > currentSections.length) {
          sectionEndIndex = i;
          break;
        }
      }
    }

    if (sectionStartIndex === -1) {
      throw new RetroError('Failed to locate last retro section for update');
    }

    // Rebuild the section with updated weak topics, notes, and learning plan
    const newSection = buildSection(
      lastSection.when,
      lastSection.interviewId,
      combinedTopics,
      combinedNotes,
      plan.content,
    );

    const newLines = [
      ...lines.slice(0, sectionStartIndex),
      newSection,
      ...lines.slice(sectionEndIndex),
    ];
    let fileContent = newLines.join('\n');

    // Persist steer marker when explicitly provided
    if (steer !== undefined) {
      fileContent = replaceSteer(fileContent, steer);
    }

    const written = await atomicWrite(retroPath, fileContent);
    if (!written) {
      throw new RetroError(`Failed to write retro.md for ${slug}`);
    }

    // Write toolhash sidecar for retro.md
    await writeToolhash(retroPath, computeHash(fileContent));

    logger.info({ slug, retroIndex: currentSections.length }, 'retro.appended');
    return {
      content: plan.content,
      wordCount: countWords(plan.content),
      model: plan.model,
      durationMs: plan.durationMs,
      index: currentSections.length,
    };
  });
}

/**
 * Read existing retro entries for an application.
 *
 * @param campaign - Campaign name.
 * @param slug - Application slug.
 * @returns The raw retro.md content.
 * @throws {RetroNotFoundError} if the file cannot be read.
 */
export async function showRetro(campaign: string, slug: string): Promise<string> {
  const campaignRoot = resolveCampaignRoot(campaign);
  const appliedDir = resolveAppliedDir(campaignRoot);
  const retroPath = join(appliedDir, slug, 'retro.md');

  try {
    return await readFile(retroPath, 'utf8');
  } catch {
    throw new RetroNotFoundError(slug);
  }
}
