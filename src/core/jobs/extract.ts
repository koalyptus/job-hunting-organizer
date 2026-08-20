import type { Logger } from 'pino';
import { convert } from 'html-to-text';
import { chatComplete, parseJsonResult } from '../llm.js';
import { loadPromptTemplate } from '../prompts.js';
import { fetchWithFallback, type FetchResult } from '../fetch.js';
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
 * Extract the job site from a URL by returning its hostname
 * (e.g. `https://au.indeed.com/viewjob?x=1` → `au.indeed.com`).
 *
 * We intentionally use the hostname as-is rather than maintaining an
 * arbitrary mapping of known boards — this keeps `By site` correct for
 * any site, including regional and ATS hosts (`uk.indeed.com`, Workday,
 * SuccessFactors, etc.). Leading `www.` is stripped so `www.linkedin.com`
 * and `linkedin.com` aggregate into the same bucket. Returns
 * `undefined` for unparseable URLs.
 */
export function extractSiteFromUrl(url: string): string | undefined {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.startsWith('www.') ? hostname.slice('www.'.length) : hostname;
  } catch {
    return undefined;
  }
}

/** Strip HTML tags and decode entities using `html-to-text`. */
export function stripHtml(html: string): string {
  return convert(html, {
    selectors: [
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'nav', format: 'skip' },
      { selector: 'footer', format: 'skip' },
      { selector: 'header', format: 'skip' },
      { selector: 'aside', format: 'skip' },
      { selector: '.cookie', format: 'skip' },
      { selector: '.sidebar', format: 'skip' },
      { selector: 'a', options: { linkBrackets: false, ignoreHref: true } },
    ],
    wordwrap: false,
  });
}

/** Load the jd-extract prompt template. */
async function loadPrompt(): Promise<{ systemPrompt: string; temperature: number }> {
  const { body, temperature } = await loadPromptTemplate(PROMPT_NAME, JD_EXTRACT_TEMPERATURE);
  return { systemPrompt: body, temperature };
}

/**
 * Send raw text to the LLM for structured JD extraction.
 * Retries up to {@link MAX_RETRIES} times when validation fails.
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

    const result = await chatComplete(
      messages,
      llmConfig,
      {
        jsonMode: true,
        temperature,
        timeout: llmConfig.timeoutMs,
      },
      log,
    );

    try {
      const parsed = parseJsonResult(result.content, ExtractedJdSchema) as ExtractedJd;
      log?.debug({ attempt, title: parsed.title, company: parsed.company }, 'extract.complete');
      return { ...parsed, rawText: text };
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
 * fields via the LLM.
 */
export async function extractJdFromUrl(
  url: string,
  llmConfig: LlmConfig,
  log?: Logger,
  timeoutMs?: number,
): Promise<ExtractedJd> {
  let fetchResult: FetchResult;
  try {
    fetchResult = await fetchWithFallback(url, { timeoutMs }, log);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(msg);
  }
  const plainText = stripHtml(fetchResult.body);
  const jd = await extractJdFromText(plainText, llmConfig, log);
  if (!jd.site) {
    const site = extractSiteFromUrl(url);
    if (site) {
      return { ...jd, site };
    }
  }
  return jd;
}
