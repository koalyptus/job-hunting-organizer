/**
 * Core orchestrator for the `jho answer` workflow. Follows the same
 * pattern as `core/cover-letter.ts`: all business logic lives here,
 * the CLI is a thin wrapper that parses options and catches errors.
 *
 * This module is reusable from both the CLI and the MCP server.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { resolveCampaignRoot, resolveAppliedDir } from '../paths.js';
import { getConfig } from '../config/config.js';
import { defaultLlmConfig, chatComplete } from '../llm.js';
import { loadPromptTemplate } from '../prompts.js';
import { readProfile } from '../campaign/profile.js';
import { readApplication } from './applications.js';
import { loadKnowledgeBaseContext } from '../campaign/kb-context.js';
import { atomicWrite } from '../fs.js';
import { acquireLock } from '../locks.js';
import { extractJdContent, isRefusal, countWords } from '../generation-utils.js';
import type { AnswerOptions, AnswerResult } from '../types.js';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

/** Prompt template name (without `.md`). */
const PROMPT_NAME = 'application-qa';

/**
 * Thrown when the Q&A generation fails.
 */
export class AnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnswerError';
  }
}

/**
 * Format a timestamp for the Q&A header.
 */
function formatTimestamp(date: Date): string {
  const iso = date.toISOString();
  return iso.replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

/**
 * Determine the source label from the input options.
 */
function resolveSource(imagePath?: string): string {
  if (imagePath) {
    return 'screenshot';
  }
  return 'application form';
}

/**
 * Answer a question for an application. Reads the application's JD
 * and the candidate's profile, calls the LLM, and appends the
 * answer to `qa.md`.
 *
 * @returns The generated answer and metadata.
 * @throws {AnswerError} on generation failure.
 */
export async function answerQuestion(opts: AnswerOptions): Promise<AnswerResult> {
  const { slug, campaign, question, imagePath, steer, log } = opts;

  const campaignRoot = resolveCampaignRoot(campaign);
  const appliedDir = resolveAppliedDir(campaignRoot);

  // Read application
  let app;
  try {
    app = await readApplication(appliedDir, slug);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AnswerError(`Failed to read application: ${msg}`);
  }

  const { frontmatter } = app;

  // Read JD from jd.md
  const appFolder = join(appliedDir, slug);
  let jdContent: string;
  try {
    jdContent = await readFile(join(appFolder, 'jd.md'), 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AnswerError(`Failed to read JD: ${msg}`);
  }
  const jdText = extractJdContent(jdContent);

  // Read profile
  let profile: string;
  try {
    profile = await readProfile(campaignRoot);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AnswerError(`Failed to read profile: ${msg}`);
  }

  // Load prompt
  const { body: systemPrompt, temperature } = await loadPromptTemplate(PROMPT_NAME);

  // Build message parts with steer
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
    '## Question',
    '',
    question,
  ];

  // Feed user knowledge-base docs into the prompt (always-on; see kb-context).
  const kb = await loadKnowledgeBaseContext(campaignRoot, {
    maxChars: getConfig(campaign).campaign.knowledgeBase.maxChars,
  });
  if (kb) {
    messageParts.push('', '---', '', '## Knowledge base', '', kb);
  }

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

  // Build messages (support multimodal for images)
  const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: systemPrompt }];

  if (imagePath) {
    // Read image file and encode as base64
    let imageBase64: string;
    let mimeType = 'image/png';
    try {
      const imageBuffer = await readFile(imagePath);
      imageBase64 = imageBuffer.toString('base64');
      // Detect mime type from extension
      if (imagePath.endsWith('.jpg') || imagePath.endsWith('.jpeg')) {
        mimeType = 'image/jpeg';
      } else if (imagePath.endsWith('.gif')) {
        mimeType = 'image/gif';
      } else if (imagePath.endsWith('.webp')) {
        mimeType = 'image/webp';
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new AnswerError(`Failed to read image: ${msg}`);
    }

    messages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: messageParts.join('\n'),
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:${mimeType};base64,${imageBase64}`,
          },
        },
      ],
    });
  } else {
    messages.push({
      role: 'user',
      content: messageParts.join('\n'),
    });
  }

  // Call LLM
  let result;
  try {
    const { global } = getConfig(campaign);
    const llmConfig = defaultLlmConfig(global);
    result = await chatComplete(messages, llmConfig, { temperature }, log);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new AnswerError(`LLM call failed: ${msg}`);
  }

  const answer = result.content.trim();

  // Check for refusal
  if (isRefusal(answer)) {
    throw new AnswerError('LLM refused to answer the question');
  }

  // Append to qa.md (skip if noSave)
  if (!opts.noSave) {
    const qaPath = join(appFolder, 'qa.md');
    const source = resolveSource(imagePath);
    const timestamp = formatTimestamp(new Date());
    const imageLabel = imagePath ? `image:${basename(imagePath)}` : 'text';

    const qaEntry = [
      '',
      `## ${timestamp} — "${question}" [${imageLabel}]`,
      '',
      `- Source: ${source}`,
      ...(steer ? [`- Steer: ${steer}`] : []),
      `- Answer:`,
      `  > ${answer.split('\n').join('\n  > ')}`,
      '',
    ].join('\n');

    await acquireLock(appFolder, async () => {
      let existingContent = '';
      if (existsSync(qaPath)) {
        existingContent = await readFile(qaPath, 'utf8');
      }

      // Add header if file is new
      if (!existingContent) {
        existingContent = `# Q&A — ${frontmatter.title} @ ${frontmatter.company}\n`;
      }

      const newContent = existingContent.trimEnd() + '\n' + qaEntry;
      const written = await atomicWrite(qaPath, newContent);
      if (!written) {
        throw new AnswerError(`Failed to write qa.md`);
      }
    });
  }

  log?.info(
    { slug, model: result.model, wordCount: countWords(answer), durationMs: result.durationMs },
    'qa.answered',
  );

  return {
    answer,
    wordCount: countWords(answer),
    model: result.model,
    durationMs: result.durationMs,
  };
}

/**
 * Thrown when the Q&A file cannot be read.
 */
export class QaReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QaReadError';
  }
}

/**
 * Read existing Q&A entries for an application.
 *
 * @param campaign - Campaign name.
 * @param slug - Application slug.
 * @returns The Q&A content.
 * @throws {QaReadError} if the file cannot be read.
 */
export async function readQa(campaign: string, slug: string): Promise<string> {
  const campaignRoot = resolveCampaignRoot(campaign);
  const appliedDir = resolveAppliedDir(campaignRoot);
  const qaPath = join(appliedDir, slug, 'qa.md');

  try {
    return await readFile(qaPath, 'utf8');
  } catch {
    throw new QaReadError(
      `No Q&A entries found for "${slug}".\nGenerate one with: jho answer ${slug} "your question"`,
    );
  }
}
