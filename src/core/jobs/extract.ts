import type { Logger } from 'pino';
import { convert } from 'html-to-text';
import { chatComplete, parseJsonResult } from '../llm.js';
import { loadPromptTemplate } from '../prompts.js';
import { fetchWithFallback } from '../fetch.js';
import { ExtractedJdSchema } from './jd-schema.js';
import type { ExtractedJd } from './types.js';
import type { LlmConfig } from '../types.js';

/** Prompt template name (without `.md`). */
const PROMPT_NAME = 'jd-extract';

/** Maximum number of retries when the LLM output fails Zod validation. */
const MAX_RETRIES = 2;

/** Temperature fallback for structured JD extraction (low for consistent JSON output). */
const JD_EXTRACT_TEMPERATURE = 0.1;

/**
 * Strip HTML tags and decode entities using `html-to-text`. Skips
 * `<script>` and `<style>` elements. Returns clean plain text suitable
 * for LLM consumption.
 */
export function stripHtml(html: string): string {
  return convert(html, {
    selectors: [
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'a', options: { linkBrackets: false, ignoreHref: true } },
    ],
    wordwrap: false,
  });
}

/**
 * Load the jd-extract prompt template. Returns the system prompt
 * and the recommended temperature.
 * @returns The system prompt and the recommended temperature.
 */
async function loadPrompt(): Promise<{ systemPrompt: string; temperature: number }> {
  const { body, temperature } = await loadPromptTemplate(PROMPT_NAME, JD_EXTRACT_TEMPERATURE);
  return { systemPrompt: body, temperature };
}

/**
 * Send raw text to the LLM for structured JD extraction. Uses the
 * `jd-extract.md` prompt template with `jsonMode: true` and the
 * temperature from the prompt's `recommendedTemperature` frontmatter.
 * Retries up to {@link MAX_RETRIES} times when the LLM output fails
 * Zod validation.
 *
 * @throws after {@link MAX_RETRIES} + 1 attempts with the last validation error.
 */
export async function extractJdFromText(
  text: string,
  llmConfig: LlmConfig,
  log?: Logger,
): Promise<ExtractedJd> {
  const { systemPrompt, temperature } = await loadPrompt();

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const messages: Parameters<typeof chatComplete>[0] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ];

    if (lastError) {
      messages.push({
        role: 'user',
        content:
          `Your previous output failed validation: ${lastError.message}\n` +
          'Fix the issues and return only valid JSON matching the schema.',
      });
    }

    log?.debug({ attempt, textLength: text.length }, 'extract.start');

    const result = await chatComplete(messages, llmConfig, { jsonMode: true, temperature }, log);

    try {
      const parsed = parseJsonResult(result.content, ExtractedJdSchema);
      log?.debug({ attempt, title: parsed.title, company: parsed.company }, 'extract.complete');
      return parsed;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      log?.warn({ attempt, error: lastError.message }, 'extract.validation_failed');
    }
  }

  log?.error({ attempts: MAX_RETRIES + 1, error: lastError?.message }, 'extract.failed');
  throw new Error(
    `JD extraction failed after ${MAX_RETRIES + 1} attempts: ${lastError?.message ?? 'unknown error'}`,
  );
}

/**
 * Fetch a job posting from a URL, strip HTML, and extract structured
 * fields via the LLM. Combines {@link fetchWithFallback},
 * {@link stripHtml}, and {@link extractJdFromText}.
 */
export async function extractJdFromUrl(
  url: string,
  llmConfig: LlmConfig,
  log?: Logger,
): Promise<ExtractedJd> {
  const fetchResult = await fetchWithFallback(url, {}, log);
  const plainText = stripHtml(fetchResult.body);
  return extractJdFromText(plainText, llmConfig, log);
}
