/**
 * Shared utilities for LLM-backed generation modules (cover letter, Q&A,
 * prepare, evals). Keeps common logic DRY across generation workflows.
 */
import { findRegion } from './parser/markers.js';

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
  /I can't/i,
  /I'm unable/i,
  /I am unable/i,
  /I'm just an AI/i,
  /as a language model/i,
  /as an AI assistant/i,
  /profile is empty/i,
  /profile missing/i,
  /no profile provided/i,
  /no candidate profile/i,
  /I don't have access to your profile/i,
  /unable to generate/i,
  /I'm sorry.*but.*(?:can't|cannot|unable)/i,
  /without a (?:CV|profile|resume)/i,
  /please provide/i,
  /I need (?:a |your )?(?:CV|profile|resume)/i,
  /no (?:CV|profile|resume) (?:was |is )?provided/i,
  /insufficient (?:information|context|data)/i,
  /I don't have (?:enough |sufficient )?(?:information|context|data)/i,
  /unable to proceed/i,
  /cannot proceed/i,
  /can't proceed/i,
  /I'm not able to/i,
  /I am not able to/i,
  /not enough (?:information|context|data)/i,
  /no (?:content|data|input) (?:was |is )?provided/i,
  /empty (?:input|content)/i,
  /^\s*\{\s*"title"\s*:\s*"unknown"/i,
  /^\s*\{\s*"company"\s*:\s*"unknown"/i,
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
