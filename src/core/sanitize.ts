/**
 * Slug-friendly text sanitization. Both functions are tailored for the
 * slug convention: lowercase, `&` → `and`, every non-alphanumeric run
 * collapsed to a single `-`, leading/trailing `-` stripped.
 *
 * `sanitizeUnbounded` keeps the entire cleaned string (no length cap).
 * `sanitizeToken` additionally truncates to `maxLen` and drops any
 * trailing `-` left by the truncation.
 */

/**
 * Sanitize a string for use in a slug. Lowercase, replace `&` with `and`,
 * collapse every non-alphanumeric run to a single `-`, and strip
 * leading/trailing `-`. No length cap.
 * @param input - The text to clean. May contain any UTF-16 string.
 * @returns The cleaned string, or `''` if nothing alphanumeric remains.
 */
export function sanitizeUnbounded(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Sanitize a string and cap it at `maxLen` characters. If truncation
 * leaves a trailing `-`, it is removed. Use this when the cleaned value
 * must fit a fixed width (e.g. `roleAbbr` ≤ 24 chars).
 * @param input - The text to clean.
 * @param maxLen - The maximum length of the returned string, in characters.
 * @returns The cleaned, possibly-truncated string.
 */
export function sanitizeToken(input: string, maxLen: number): string {
  const cleaned = sanitizeUnbounded(input);
  if (cleaned.length <= maxLen) {
    return cleaned;
  }
  return cleaned.slice(0, maxLen).replace(/-+$/, '');
}
