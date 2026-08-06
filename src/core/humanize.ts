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
const COMMA_RUN = /,(\s*,)+/g;

/**
 * Em dash (U+2014), the char this module rewrites in runs of 3+.
 * Built via code point (not a literal) because vitest's transform drops raw
 * em-dash characters from string literals; tests import this constant too.
 */
export const EM_DASH = String.fromCodePoint(0x2014);

/** Run of 3+ consecutive em-dashes (the "chain" tell), with surrounding spaces. */
const EM_DASH_RUN = new RegExp(`[ \\t]*(?:${EM_DASH}){3,}[ \\t]*`, 'g');

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

  // Em-dash chains: a run of 3+ consecutive em-dashes → one comma. Spacing is
  // decided per-run so real commas (e.g. thousands separators) are never touched.
  result = result.replace(EM_DASH_RUN, (run, offset, whole) => {
    const next = whole[offset + run.length] ?? '';
    if (next === '') {
      return ''; // dangling chain at EOF: drop it
    }
    if (next === '(') {
      return ' '; // opener: single space, no comma
    }
    if (
      next === '.' ||
      next === ')' ||
      next === ']' ||
      next === '}' ||
      next === '!' ||
      next === '?' ||
      next === '\n' ||
      next === '\r'
    ) {
      return ''; // closer or end of line: drop
    }
    return ', '; // between words: comma + single space
  });
  // Collapse comma runs left adjacent to the rewrite (', ,' / ',,') — scoped to
  // this pass, so it never touches real text commas.
  result = result.replace(COMMA_RUN, ', ');

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
