/**
 * URL helpers used by the slug builder and the future JD fetcher (Phase 3+).
 * Keep this module side-effect free: no network calls, no file I/O.
 */

/**
 * Detect whether a string looks like a URL (starts with http:// or https://).
 * Returns false for undefined or empty strings.
 */
export function isUrl(value: string | undefined): boolean {
  return value !== undefined && /^https?:\/\//i.test(value);
}

/**
 * Site-specific patterns for extracting a job-board ID from a posting URL.
 * The `name` is for diagnostics only; `group` is the capture index that
 * holds the ID. Patterns are tried in order; the first match wins.
 *
 * `generic-trailing` is a last-resort fallback: any 5+ digit number at the
 * end of a path segment, preceded by a slash or dash, and not looking like a year (1900-2099).
 * This catches boards we don't have an explicit pattern for, at the cost of occasional false positives.
 */
const BUILT_IN_PATTERNS: readonly {
  readonly name: string;
  readonly pattern: RegExp;
  readonly group: number;
}[] = [
  { name: 'linkedin', pattern: /linkedin\.com\/jobs\/view\/(\d+)/, group: 1 },
  { name: 'indeed-jk', pattern: /[?&]jk=([A-Za-z0-9_-]+)/, group: 1 },
  { name: 'seek-trailing', pattern: /\/job(?:s)?\/(\d+)(?:[/?#]|$)/, group: 1 },
  {
    name: 'generic-trailing',
    // Match 5+ digits preceded by slash or dash, not starting with 19 or 20 (to avoid years)
    pattern: /(?:\/|-)(?!19|20)(\d{5,})(?:[/?#]|$)/,
    group: 1,
  },
];

/**
 * Parse and validate user-supplied patterns from the JHO_URL_PATTERNS environment variable.
 * Expected format: JSON array of objects with { name: string, pattern: string, group: number }.
 * Invalid entries are skipped and a warning is logged.
 * @returns Array of validated pattern objects, or empty array if parsing fails or variable is unset.
 */
function getUserPatternsFromEnv(): {
  name: string;
  pattern: RegExp;
  group: number;
}[] {
  const env = process.env.JHO_URL_PATTERNS;
  if (!env) {
    return [];
  }
  try {
    const parsed = JSON.parse(env);
    if (!Array.isArray(parsed)) {
      console.warn('JHO_URL_PATTERNS must be a JSON array');
      return [];
    }
    return parsed
      .map((p, index) => {
        if (typeof p !== 'object' || p === null) {
          console.warn(`JHO_URL_PATTERNS[${index}] is not an object`);
          return null;
        }
        const { name, pattern, group } = p;
        if (typeof name !== 'string' || typeof pattern !== 'string' || typeof group !== 'number') {
          console.warn(`JHO_URL_PATTERNS[${index}] missing required fields or wrong type`);
          return null;
        }
        try {
          const regex = new RegExp(pattern);
          return { name, pattern: regex, group };
        } catch (e) {
          console.warn(`JHO_URL_PATTERNS[${index}] invalid regex pattern: ${String(e)}`);
          return null;
        }
      })
      .filter((p): p is { name: string; pattern: RegExp; group: number } => p !== null);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(`Failed to parse JHO_URL_PATTERNS: ${message}`);
    return [];
  }
}

/**
 * Combined patterns: user-supplied patterns (if any) take precedence, followed by built-in patterns.
 * This allows users to override or supplement the built-in patterns via JHO_URL_PATTERNS.
 */
const JOB_ID_PATTERNS: readonly {
  readonly name: string;
  readonly pattern: RegExp;
  readonly group: number;
}[] = [...getUserPatternsFromEnv(), ...BUILT_IN_PATTERNS];

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
