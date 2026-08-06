/**
 * Deterministic post-processor for LLM-generated prose.
 *
 * Strips the mechanical "AI tells" the model leaks regardless of how strongly
 * the prompt asks it not to: em-dash chains, stretched whitespace, and funky
 * smart/curly quotes. Expressive guidance (verb swaps, banned openers, filler
 * phrases, reassurance kickers, chatbot artifacts) lives in the shared
 * `prompts/humanize-voice.md` voice prompt instead — this function only does
 * what can be enforced mechanically, so it stays a small, safe, testable net.
 *
 * Pure function: no I/O, no config, no logging, no state.
 * Idempotent: `humanize(humanize(x)) === humanize(x)`.
 */

/** Smart/curly left/right double quotes → straight double quote. */
const SMART_DOUBLE = /[“”]/g;
/** Smart/curly left/right single quotes (incl. apostrophe) → straight single quote. */
const SMART_SINGLE = /[‘’]/g;
/** Other Unicode quote-like glyphs (guillemets, fullwidth, corner brackets) → straight. */
const UNICODE_QUOTES = /[«»「」『』〝〞＂＇‹›]/g;

/** Run of 2+ spaces → single space. */
const MULTI_SPACE = /  +/g;
/** Run of 3+ newlines → two newlines (blank line). */
const MULTI_NEWLINE = /\n{3,}/g;
/** Trailing whitespace at end of any line. */
const TRAILING_WHITESPACE = /[ \t]+$/gm;

/** Collapse adjacent commas left by the em-dash→comma rewrite. */
const MULTI_COMMA = /,{2,}/g;

const EM_DASH = String.fromCodePoint(0x2014);

/**
 * Normalize mechanical AI tells in LLM prose.
 *
 * @param text - Raw LLM output.
 * @returns The cleaned text. Refusals are not special-cased here; callers run
 *   `isRefusal()` after this so refusals pass through unchanged.
 */
export function humanize(text: string): string {
  if (!text) {
    return text;
  }

  let result = text;

  // Em-dash chains: 3+ em-dashes → commas (with spacing fix-up).
  const emDashCount = countOccurrences(result, EM_DASH);
  if (emDashCount >= 3) {
    result = result.replaceAll(EM_DASH, ',');
    result = result.replace(MULTI_COMMA, ',');
    // Comma directly before a period or paren: drop it.
    result = result.replace(/,\s*([().])/g, '$1');
    // No space before a comma; exactly one space after.
    result = result.replace(/\s+,/g, ',');
    result = result.replace(/,(?=\S)/g, ', ');
  }

  // Stretched whitespace.
  result = result.replace(MULTI_SPACE, ' ');
  result = result.replace(MULTI_NEWLINE, '\n\n');
  result = result.replace(TRAILING_WHITESPACE, '');

  // Funky smart/curly quotes → straight quotes.
  result = result.replace(SMART_DOUBLE, '"');
  result = result.replace(SMART_SINGLE, "'");
  result = result.replace(UNICODE_QUOTES, '"');

  return result;
}

/**
 * Count non-overlapping occurrences of a substring.
 *
 * @param haystack - Text to search.
 * @param needle - Substring to count. An empty needle returns 0 (and would
 *   otherwise loop forever via `indexOf`).
 * @returns Number of non-overlapping occurrences.
 */
export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) {
    return 0;
  }
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}
