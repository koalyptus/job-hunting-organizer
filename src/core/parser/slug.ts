// Slug convention (from PLAN §4): {YYYY}-{MMM}-{DD}-{roleAbbr}-{companySlug}[-{jobId}][-{n}]
// Example: 2026-Jun-03-SE-Nuage-Technology-Group-92448554-1
//
// Components:
//   YYYY-MMM-DD  : appliedOn (default: today, UTC)
//   roleAbbr     : first 2-3 words of title, sanitized, <= 24 chars
//   companySlug  : company name, lowercased + hyphens, <= 32 chars
//   jobId        : optional, extracted from the URL (LinkedIn, Seek, Indeed, generic)
//   -N           : optional, integer suffix on collision (see core/counters.ts)

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { formatDateUtc, parseDateOrNow, MONTH_ABBR } from '../date.js';
import { sanitizeToken, sanitizeUnbounded } from './sanitize.js';
import { extractJobIdFromUrl } from './url.js';
import { readCountersAsync, writeCountersAsync } from '../applications/counters.js';
import { getRootLogger } from '../logger/logger.js';
import type { SlugBuildInput, SlugOptions } from '../types.js';

/**
 * Regex that matches any well-formed application slug. Used by cwd
 * inference in `core/paths.ts` and by tests that need to recognise a
 * folder name as a slug.
 */
export const SLUG_PATTERN = /^\d{4}-[A-Z][a-z]{2}-\d{2}-.+$/;

/**
 * Regex that captures the date components (year, month abbreviation, day)
 * from the start of a slug. Used by {@link extractDateFromSlug}.
 */
const SLUG_DATE_RE = /^(\d{4})-([A-Z][a-z]{2})-(\d{2})/;

/**
 * Extract a sortable date string from a slug. Slugs start with
 * `YYYY-MMM-DD`; this converts the month abbreviation to a number
 * so lexicographic sorting works correctly (e.g. `'20260603'`).
 * @param slug - The application slug.
 * @returns A string like `'20260603'` for date-based sorting, or `''` if unparseable.
 */
export function extractDateFromSlug(slug: string): string {
  const dateMatch = slug.match(SLUG_DATE_RE);
  if (!dateMatch) {
    return '';
  }
  const year = dateMatch[1]!;
  const monthIdx = MONTH_ABBR.indexOf(dateMatch[2] as (typeof MONTH_ABBR)[number]);
  const day = dateMatch[3]!;
  if (monthIdx === -1) {
    return '';
  }
  return `${year}${String(monthIdx + 1).padStart(2, '0')}${day}`;
}

/**
 * Reduce a job title to the first 2-3 sanitized words, fitting in
 * `maxLen` characters. Tries the most words first and falls back to
 * fewer when the full prefix would be truncated; only returns a
 * truncated form if no N-word prefix fits at all.
 * @param title - The full job title.
 * @param maxWords - Maximum words to consider. Default: 3.
 * @param maxLen - Maximum length of the returned string. Default: 24.
 * @returns The sanitized role abbreviation, or `''` if nothing fits.
 */
export function roleAbbr(title: string, maxWords = 3, maxLen = 24): string {
  const words = title
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  for (let n = Math.min(maxWords, words.length); n >= 1; n--) {
    const joined = words.slice(0, n).join(' ');
    const full = sanitizeUnbounded(joined);
    if (full.length > 0 && full.length <= maxLen) {
      return full;
    }
  }
  if (words.length > 0) {
    const first = sanitizeUnbounded(words[0] ?? '');
    if (first.length > 0) {
      return first.slice(0, maxLen).replace(/-+$/, '');
    }
  }
  return '';
}

/**
 * Reduce a company name to a slug-friendly token. Returns the literal
 * `'unknown'` when the company is empty or sanitizes to nothing.
 * @param company - The company name.
 * @param maxLen - Maximum length of the returned string. Default: 32.
 * @returns The sanitized company slug, or `'unknown'`.
 */
export function companySlug(company: string, maxLen = 32): string {
  const sanitized = sanitizeToken(company, maxLen);
  if (sanitized.length === 0) {
    getRootLogger().debug({ company }, 'slug.company.fallback_unknown');
    return 'unknown';
  }
  return sanitized;
}

/**
 * Compose a full application slug from the standard components. Missing
 * inputs are filled with `'unknown'` so the output is always a valid
 * slug. The collision suffix `-N` is intentionally NOT added here — the
 * caller checks {@link readCollisionSuffix} and appends the suffix.
 * @param input - The slug inputs. All fields are optional.
 * @param _options - Reserved for future use. Ignored for now.
 * @returns A slug like `2026-Jun-03-senior-engineer-nuage-92448554`.
 */
export function buildSlug(input: SlugBuildInput, _options: SlugOptions = {}): string {
  const date = parseDateOrNow(input.appliedOn);
  const datePart = formatDateUtc(date);
  const role = roleAbbr(input.title ?? 'unknown');
  const company = companySlug(input.company ?? 'unknown');
  const jobId = input.url !== undefined ? extractJobIdFromUrl(input.url) : null;

  const base = `${datePart}-${role}-${company}`;
  if (jobId !== null) {
    return `${base}-${jobId}`;
  }
  return base;
}

/**
 * Build a unique slug for a new application. Handles collision suffixes
 * by reading the counter and appending `-N` when needed.
 * @param input - Fields for slug generation.
 * @param appliedDir - The applied directory (for counter lookups).
 * @returns A unique slug string.
 */
export async function uniqueSlug(
  input: { title?: string; company?: string; url?: string; appliedOn?: string | Date },
  appliedDir: string,
): Promise<string> {
  const base = buildSlug({
    title: input.title,
    company: input.company,
    url: input.url,
    appliedOn: input.appliedOn,
  });

  const counters = await readCountersAsync(appliedDir);
  const current = counters[base] ?? 0;

  if (current === 0 && !existsSync(join(appliedDir, base))) {
    return base;
  }

  const next = current + 1;
  counters[base] = next;
  getRootLogger().debug({ base, suffix: next }, 'slug.collision');
  const written = await writeCountersAsync(appliedDir, counters);
  if (!written) {
    getRootLogger().debug({ slug: `${base}-${next}` }, 'failed to persist collision counter');
  }
  return `${base}-${next}`;
}
