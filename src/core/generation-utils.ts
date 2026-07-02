/**
 * Shared utilities for LLM-backed generation modules (cover letter, Q&A).
 * Keeps common logic DRY across `core/cover-letter.ts` and `core/application-qa.ts`.
 */
import { findRegion } from './markers.js';

/**
 * Extract the JD text from `jd.md` content by reading the `fetched-jd`
 * region. Returns the region content, or the full file content if no
 * markers are found.
 *
 * @param jdContent - The raw content of `jd.md`.
 * @returns The extracted JD text.
 */
export function extractJdContent(jdContent: string): string {
  const region = findRegion(jdContent, 'fetched-jd');
  return region?.content ?? jdContent;
}

/**
 * Common refusal patterns for LLM-generated content. If any pattern
 * matches the output, the LLM refused to generate the requested content.
 */
export const REFUSAL_PATTERNS: readonly RegExp[] = [
  /I cannot/i,
  /I'm just an AI/i,
  /as a language model/i,
  /as an AI assistant/i,
];

/**
 * Check if the LLM output is a refusal.
 *
 * @param content - The LLM output to check.
 * @returns `true` if the output matches any refusal pattern.
 */
export function isRefusal(content: string): boolean {
  return REFUSAL_PATTERNS.some((p) => p.test(content));
}

/**
 * Count words in a string (split on whitespace).
 *
 * @param text - The text to count words in.
 * @returns The approximate word count.
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
