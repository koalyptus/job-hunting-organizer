/**
 * Core orchestrator for the `jho prepare` workflow. Follows the same
 * read→LLM→write pattern as `core/applications/cover-letter.ts`.
 *
 * This module is reusable from both the CLI and the MCP server.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { resolveCampaignRoot, resolveAppliedDir } from '../paths.js';
import { getConfig } from '../config/config.js';
import { defaultLlmConfig, chatComplete, extractJson } from '../llm.js';
import { loadPromptTemplate } from '../prompts.js';
import { readProfile } from '../campaign/profile.js';
import { readApplication } from '../applications/applications.js';
import { replaceRegion, extractSteer, replaceSteer } from '../parser/markers.js';
import { loadKnowledgeBaseContext } from '../campaign/kb-context.js';
import { atomicWrite } from '../fs.js';
import { acquireLock } from '../locks.js';
import { extractJdContent, isRefusal, countWords } from '../generation-utils.js';
import { computeHash, writeToolhash } from '../toolhash.js';
import { aggregateRetros } from '../retro/aggregate.js';
import { moduleLogger } from '../logger/logger.js';
import type { Logger } from 'pino';
import type {
  PrepDepth,
  PrepPlan,
  GeneratePrepOptions,
  GeneratePrepFromTextOptions,
  GeneratePrepResult,
} from './types.js';

const log = moduleLogger(import.meta.url);

/** Prompt template name (without `.md`). */
const PROMPT_NAME = 'prepare';

const PREP_MARKER =
  '<!-- jho:prepare — pre-interview prep plan. Tool rewrites region on each run; appends topics on --add. -->';

const PREP_REGION_NAME = 'prepare';

// ─── Zod schemas for structured LLM output ──────────────────────────────────

const TopicSchema = z.object({
  title: z.string(),
  whatToKnow: z.array(z.string()),
  resources: z.array(z.string()),
  estimatedTime: z.string(),
  depth: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

const BehavioralSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

const TimelineSchema = z.object({
  daysBefore: z.number().int().min(0),
  task: z.string(),
});

export const PrepPlanSchema = z.object({
  topics: z.array(TopicSchema),
  behavioral: z.array(BehavioralSchema),
  timeline: z.array(TimelineSchema),
  checklist: z.array(z.string()),
  notes: z.string(),
});

// ─── Error classes ───────────────────────────────────────────────────────────

/**
 * Thrown when prep plan generation fails.
 */
export class PrepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrepError';
  }
}

/**
 * Thrown when no prep plan exists for an application.
 */
export class PrepNotFoundError extends PrepError {
  constructor(slug: string) {
    super(`prep not found: ${slug}`);
    this.name = 'PrepNotFoundError';
  }
}

/**
 * Thrown when reading an existing prep plan fails.
 */
export class PrepReadError extends PrepError {
  constructor(message: string) {
    super(message);
    this.name = 'PrepReadError';
  }
}

// ─── Formatting ──────────────────────────────────────────────────────────────

/**
 * Format a parsed prep plan into readable markdown.
 *
 * @param plan - The parsed prep plan.
 * @returns Formatted markdown string.
 */
export function formatPrepPlan(plan: PrepPlan): string {
  const lines: string[] = [];

  lines.push('# Prep plan\n');

  if (plan.topics.length > 0) {
    lines.push('## Topics\n');
    for (const topic of plan.topics) {
      lines.push(`### ${topic.title} (depth ${topic.depth})\n`);
      lines.push('**What to know:**\n');
      for (const point of topic.whatToKnow) {
        lines.push(`- ${point}`);
      }
      lines.push('');
      lines.push('**Resources:**\n');
      for (const resource of topic.resources) {
        lines.push(`- ${resource}`);
      }
      lines.push('');
      lines.push(`**Estimated time:** ${topic.estimatedTime}\n`);
    }
  }

  if (plan.behavioralQuestions.length > 0) {
    lines.push('## Behavioral questions\n');
    for (const q of plan.behavioralQuestions) {
      lines.push(`**${q.question}**\n`);
      lines.push(q.answer);
      lines.push('');
    }
  }

  if (plan.timeline.length > 0) {
    lines.push('## Timeline\n');
    for (const m of plan.timeline) {
      lines.push(`- **${m.daysBefore}d before**: ${m.task}`);
    }
    lines.push('');
  }

  if (plan.checklist.length > 0) {
    lines.push('## Checklist\n');
    for (const item of plan.checklist) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push('');
  }

  if (plan.notes) {
    lines.push('## Notes\n');
    lines.push(plan.notes);
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Core orchestrator ───────────────────────────────────────────────────────

/**
 * Generate a pre-interview prep plan for an application. Reads the
 * JD, profile, and past retro data, calls the LLM, and optionally
 * writes to `prepare.md`.
 *
 * @returns The generated plan content and metadata.
 * @throws {PrepError} on generation failure.
 * @throws {PrepNotFoundError} if the application doesn't exist.
 */
export async function generatePrep(opts: GeneratePrepOptions): Promise<GeneratePrepResult> {
  const { slug, campaign, days = 7, steer, log: externalLog } = opts;

  const campaignRoot = resolveCampaignRoot(campaign);
  const appliedDir = resolveAppliedDir(campaignRoot);

  // Read application
  let app;
  try {
    app = await readApplication(appliedDir, slug);
  } catch (err) {
    if (err instanceof Error && err.name === 'ApplicationNotFoundError') {
      throw new PrepNotFoundError(slug);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new PrepError(`Failed to read application: ${msg}`);
  }

  const appFolder = join(appliedDir, slug);

  // Read JD
  let jdContent: string;
  try {
    jdContent = await readFile(join(appFolder, 'jd.md'), 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new PrepError(`Failed to read JD: ${msg}`);
  }
  const jdText = extractJdContent(jdContent);

  // Read profile
  let profile: string;
  try {
    profile = await readProfile(campaignRoot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new PrepError(`Failed to read profile: ${msg}`);
  }

  // Cross-reference past retros for weak topics
  const retroTopics = await aggregateRetros(appliedDir, {
    role: app.frontmatter.targetRole,
  });
  const retroCrossRef =
    retroTopics.length > 0
      ? [
          '',
          '---',
          '',
          '## Retro cross-reference',
          '',
          'Weak topics from previous failed interviews for this role:',
          '',
          ...retroTopics.map((t) => `- ${t.label} (${t.count}x)`),
        ].join('\n')
      : '';

  // Read existing prepare.md to extract stored steer
  const prepPath = join(appFolder, 'prepare.md');
  const existingPrep = await readFile(prepPath, 'utf8').catch(() => '');
  const existingSteer = extractSteer(existingPrep);

  // Use provided steer or fall back to existing steer
  const effectiveSteer = steer ?? existingSteer;

  // Build the plan content
  const planResult = await buildPrepPlan(
    campaign,
    app.frontmatter,
    jdText,
    profile,
    days,
    retroCrossRef,
    effectiveSteer,
    externalLog,
  );

  // Acquire lock and write
  return acquireLock(appFolder, async () => {
    let fileContent = await readFile(prepPath, 'utf8').catch(() => '');

    // Write the plan region
    fileContent = replaceRegion(fileContent, PREP_REGION_NAME, planResult.content, {
      createIfMissing: true,
    });

    // Write steer marker when explicitly provided
    if (steer !== undefined) {
      fileContent = replaceSteer(fileContent, steer);
    }

    // Prepend section marker if missing
    if (!fileContent.includes('<!-- jho:prepare ')) {
      fileContent = `${PREP_MARKER}\n\n${fileContent}`;
    }

    const written = await atomicWrite(prepPath, fileContent);
    if (!written) {
      throw new PrepError(`Failed to write prepare.md for ${slug}`);
    }

    // Write toolhash sidecar for prepare.md
    await writeToolhash(prepPath, computeHash(fileContent));

    log.info(
      { slug, model: planResult.model, wordCount: countWords(planResult.content) },
      'prep.generated',
    );

    return {
      content: planResult.content,
      wordCount: countWords(planResult.content),
      model: planResult.model,
      durationMs: planResult.durationMs,
    };
  });
}

/**
 * Generate a pre-interview prep plan from raw JD text (ad-hoc mode).
 * No file I/O — prints to stdout only.
 *
 * @returns The generated plan content and metadata.
 * @throws {PrepError} on generation failure.
 */
export async function generatePrepFromText(
  opts: GeneratePrepFromTextOptions,
): Promise<GeneratePrepResult> {
  const { jdText, campaign, days = 7, steer, log: externalLog } = opts;

  const campaignRoot = resolveCampaignRoot(campaign);

  // Read profile
  let profile: string;
  try {
    profile = await readProfile(campaignRoot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new PrepError(`Failed to read profile: ${msg}`);
  }

  const planResult = await buildPrepPlan(
    campaign,
    { title: '', company: '', location: '' },
    jdText,
    profile,
    days,
    '',
    steer,
    externalLog,
  );

  return {
    content: planResult.content,
    wordCount: countWords(planResult.content),
    model: planResult.model,
    durationMs: planResult.durationMs,
  };
}

/**
 * Read an existing prep plan for an application.
 *
 * @param campaign - Campaign name.
 * @param slug - Application slug.
 * @returns The prep plan markdown content.
 * @throws {PrepReadError} if the file cannot be read.
 */
export async function readPrep(campaign: string, slug: string): Promise<string> {
  const campaignRoot = resolveCampaignRoot(campaign);
  const appliedDir = resolveAppliedDir(campaignRoot);
  const prepPath = join(appliedDir, slug, 'prepare.md');

  try {
    return await readFile(prepPath, 'utf8');
  } catch {
    throw new PrepReadError(
      `No prep plan found for "${slug}".\nGenerate one with: jho prepare ${slug}`,
    );
  }
}

/**
 * Append a new topic to the existing prep plan. The topic is added
 * below the existing topics section without an LLM call.
 *
 * @param campaign - Campaign name.
 * @param slug - Application slug.
 * @param topic - The topic title to add.
 * @throws {PrepError} if no prep plan exists or write fails.
 */
export async function appendTopic(campaign: string, slug: string, topic: string): Promise<void> {
  const campaignRoot = resolveCampaignRoot(campaign);
  const appliedDir = resolveAppliedDir(campaignRoot);
  const appFolder = join(appliedDir, slug);
  const prepPath = join(appFolder, 'prepare.md');

  try {
    return await acquireLock(appFolder, async () => {
      let content: string;
      try {
        content = await readFile(prepPath, 'utf8');
      } catch {
        throw new PrepError(
          `No prep plan found for "${slug}".\nGenerate one with: jho prepare ${slug}`,
        );
      }

      const topicLine = `\n- ${topic}`;
      content = content.trimEnd() + '\n' + topicLine + '\n';

      const written = await atomicWrite(prepPath, content);
      if (!written) {
        throw new PrepError(`Failed to write prepare.md for ${slug}`);
      }

      // Write toolhash sidecar for prepare.md
      await writeToolhash(prepPath, computeHash(content));

      log.info({ slug, topic }, 'prep.topic-appended');
    });
  } catch (err) {
    if (err instanceof PrepError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new PrepError(`Failed to append topic: ${msg}`);
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Build the prep plan by calling the LLM. Shared between
 * {@link generatePrep} and {@link generatePrepFromText}.
 */
async function buildPrepPlan(
  campaign: string,
  frontmatter: { title: string; company: string; location: string },
  jdText: string,
  profile: string,
  days: number,
  retroCrossRef: string,
  steer: string | undefined,
  externalLog: Logger | undefined,
): Promise<{ content: string; model: string; durationMs: number }> {
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
    '## Days until interview',
    '',
    String(days),
  ];

  // Feed user knowledge-base docs into the prompt (always-on; see kb-context).
  const kbCampaignRoot = resolveCampaignRoot(campaign);
  const kb = await loadKnowledgeBaseContext(kbCampaignRoot, {
    maxChars: getConfig(campaign).campaign.knowledgeBase.maxChars,
  });
  if (kb) {
    messageParts.push('', '---', '', '## Knowledge base', '', kb);
  }

  if (retroCrossRef) {
    messageParts.push(retroCrossRef);
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
    throw new PrepError(`LLM call failed: ${msg}`);
  }

  const raw = result.content.trim();

  if (isRefusal(raw)) {
    throw new PrepError('LLM refused to generate prep plan');
  }

  // Parse JSON response
  let parsed: z.infer<typeof PrepPlanSchema>;
  try {
    const json = extractJson(raw);
    parsed = PrepPlanSchema.parse(json);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new PrepError(`Failed to parse LLM response: ${msg}`);
  }

  // Validate timeline bounds
  validateTimeline(parsed.timeline, days);

  // Convert to PrepPlan
  const plan: PrepPlan = {
    topics: parsed.topics.map((t) => ({
      title: t.title,
      whatToKnow: t.whatToKnow,
      resources: t.resources,
      estimatedTime: t.estimatedTime,
      depth: t.depth as PrepDepth,
    })),
    behavioralQuestions: parsed.behavioral.map((b) => ({
      question: b.question,
      answer: b.answer,
    })),
    timeline: parsed.timeline.map((t) => ({
      daysBefore: t.daysBefore,
      task: t.task,
    })),
    checklist: parsed.checklist,
    notes: parsed.notes,
  };

  const content = formatPrepPlan(plan);

  return { content, model: result.model, durationMs: result.durationMs };
}

/**
 * Validate that timeline milestones are within ±20% of the given days.
 */
function validateTimeline(timeline: readonly { daysBefore: number }[], days: number): void {
  const tolerance = Math.max(1, Math.round(days * 0.2));
  const minAllowed = Math.max(0, days - tolerance);
  const maxAllowed = days + tolerance;

  for (const m of timeline) {
    if (m.daysBefore < minAllowed || m.daysBefore > maxAllowed) {
      log.warn(
        { daysBefore: m.daysBefore, expected: `${minAllowed}–${maxAllowed}` },
        'prep.timeline-out-of-range',
      );
    }
  }
}
