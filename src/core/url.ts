/**
 * URL helpers used by the slug builder and the future JD fetcher (Phase 3+).
 * Keep this module side-effect free: no network calls, no file I/O.
 */

/**
 * Site-specific patterns for extracting a job-board ID from a posting URL.
 * The `name` is for diagnostics only; `group` is the capture index that
 * holds the ID. Patterns are tried in order; the first match wins.
 *
 * `generic-trailing` is a last-resort fallback: any 5+ digit number at the
 * end of a path segment. This catches boards we don't have an explicit
 * pattern for, at the cost of occasional false positives (e.g. /page/12345).
 */
const JOB_ID_PATTERNS: readonly {
  readonly name: string;
  readonly pattern: RegExp;
  readonly group: number;
}[] = [
  { name: 'linkedin', pattern: /linkedin\.com\/jobs\/view\/(\d+)/, group: 1 },
  { name: 'indeed-jk', pattern: /[?&]jk=([A-Za-z0-9_-]+)/, group: 1 },
  { name: 'seek-trailing', pattern: /\/job(?:s)?\/(\d+)(?:[/?#]|$)/, group: 1 },
  { name: 'generic-trailing', pattern: /\/(\d{5,})(?:[/?#]|$)/, group: 1 },
];

/**
 * Return the first job-board ID that matches the URL, or `null` if no
 * pattern applies. The `extractJobIdFromUrl` is intentionally lenient:
 * a `null` result means "no slug suffix", not "this isn't a job URL".
 * @param url - The full URL of the job posting.
 * @returns The matched ID, or `null` if no pattern matches.
 */
export function extractJobIdFromUrl(url: string): string | null {
  for (const { pattern, group } of JOB_ID_PATTERNS) {
    const m = url.match(pattern);
    if (m && m[group] !== undefined) {
      return m[group];
    }
  }
  return null;
}
