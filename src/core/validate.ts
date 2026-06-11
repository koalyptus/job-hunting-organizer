import { MONTH_ABBR } from './date.js';
import { SLUG_PATTERN } from './slug.js';

// ── Campaign name ───────────────────────────────────────────────────────────

/** Characters forbidden in a campaign name. */
const FORBIDDEN_CAMPAIGN = ['/', '\\'];

/**
 * Validate a campaign name. Returns `null` if valid, or an error message
 * string explaining why it's invalid.
 */
export function validateName(name: string): string | null {
  if (name === '' || name.trim() === '') {
    return 'must not be empty or whitespace-only';
  }
  if (name !== name.trim()) {
    return 'must not have leading or trailing whitespace';
  }
  if (/\s/.test(name)) {
    return 'must not contain whitespace';
  }
  if (name.startsWith('-')) {
    return 'must not start with a dash';
  }
  if (name === '.' || name === '..') {
    return 'must not be "." or ".."';
  }
  for (const ch of FORBIDDEN_CAMPAIGN) {
    if (name.includes(ch)) {
      return `must not contain "${ch}"`;
    }
  }
  return null;
}

// ── Slug ────────────────────────────────────────────────────────────────────

/**
 * Verify that a string is a well-formed slug. Checks the pattern AND
 * the semantics of each date component (valid year range, known month
 * abbreviation, valid day-of-month).
 * @param slug - The string to validate.
 * @returns `{ ok: true }` on success, `{ ok: false, reason }` otherwise.
 */
export function validateSlug(slug: string): { ok: true } | { ok: false; reason: string } {
  if (!SLUG_PATTERN.test(slug)) {
    return { ok: false, reason: 'does not match YYYY-MMM-DD-* pattern' };
  }
  const datePart = slug.slice(0, 11);
  const [yyyy, mmm, dd] = datePart.split('-');
  const year = Number(yyyy);
  const monthIdx = MONTH_ABBR.indexOf(mmm ?? '');
  const day = Number(dd);
  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    return { ok: false, reason: `invalid year: ${yyyy}` };
  }
  if (monthIdx < 0) {
    return { ok: false, reason: `invalid month abbreviation: ${mmm}` };
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return { ok: false, reason: `invalid day: ${dd}` };
  }
  return { ok: true };
}
