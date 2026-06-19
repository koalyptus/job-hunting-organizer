/**
 * Date helpers for the slug builder and any caller that needs the
 * `YYYY-MMM-DD` format (e.g. cwd slug inference, collision counter keys).
 * All functions operate in UTC to match the way slugs are computed on
 * `new Date()` (no local-tz surprises when the user crosses a date line).
 */

/**
 * English month abbreviations, indexed by `Date.getUTCMonth()`.
 * Order matches the JavaScript `Date` month numbering (0 = Jan).
 */
export const MONTH_ABBR: readonly string[] = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Format a `Date` as `YYYY-MMM-DD` in UTC.
 * @param d - The date to format. Only the UTC components are read.
 * @returns An 11-character string like `2026-Jun-03`.
 */
export function formatDateUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = MONTH_ABBR[d.getUTCMonth()];
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Format a `Date` as `YYYY-MM-DD` (ISO 8601 date-only) in UTC.
 * @param d - The date to format.
 * @returns A 10-character string like `2026-06-03`.
 */
export function toIsoDate(d: Date): string {
  return d.toISOString().split('T')[0]!;
}

/**
 * Return today's date as `YYYY-MM-DD` in UTC.
 * @returns A 10-character string like `2026-06-03`.
 */
export function todayIso(): string {
  return toIsoDate(new Date());
}

/**
 * Format a `Date` or ISO string as `YYYY-MM-DD` in UTC.
 * @param input - A Date or ISO date/datetime string.
 * @returns A 10-character string like `2026-06-03`.
 */
export function toIsoDateString(input: Date | string): string {
  if (typeof input === 'string') {
    const tIdx = input.indexOf('T');
    return tIdx === -1 ? input : input.slice(0, tIdx);
  }
  return toIsoDate(input);
}

/**
 * Parse a `Date` from a `Date` instance, an ISO 8601 string, or `undefined`
 * (meaning "now"). Strings are parsed with the platform `Date` constructor,
 * which accepts ISO 8601 and a few other common formats.
 * @param input - The date to parse, or `undefined` for the current time.
 * @returns A `Date`. The input `Date` is returned by reference, not cloned.
 * @throws {Error} If `input` is a string that cannot be parsed.
 */
export function parseDateOrNow(input: string | Date | undefined): Date {
  if (input === undefined) {
    return new Date();
  }
  if (input instanceof Date) {
    return input;
  }
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`invalid date: ${input}`);
  }
  return d;
}
