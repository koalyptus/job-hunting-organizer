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
 * Return the number of days in a given month.
 * @param year - The full year (e.g. 2024).
 * @param month - Month number (1 = January, 12 = December).
 * @returns The number of days (28, 29, 30, or 31).
 */
export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month = last day of this month
  return new Date(year, month, 0).getDate();
}

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

/**
 * Parse a `--since` value into a `Date`. Accepts ISO date strings and
 * relative durations: `7d`, `30d`, `90d` (days before `now`).
 * @param value - The since value from the CLI.
 * @param now - Reference time for relative parsing (default: `new Date()`).
 * @returns A `Date` representing the lower bound (inclusive).
 * @throws {Error} If `value` cannot be parsed.
 */
export function parseSince(value: string, now?: Date): Date {
  const relativeMatch = /^(\d+)d$/.exec(value);
  if (relativeMatch) {
    const days = parseInt(relativeMatch[1]!, 10);
    const d = now ? new Date(now) : new Date();
    d.setUTCDate(d.getUTCDate() - days);
    return d;
  }
  return parseDateOrNow(value);
}

/**
 * Parse a datetime string like "2026-06-15 10:00" or "2026-06-15 10:00:00" into
 * `[year, month, day, hour, minute]`.
 * @param datetime - A string in "YYYY-MM-DD HH:MM" or "YYYY-MM-DD HH:MM:SS" format.
 * @returns A tuple of `[year, month, day, hour, minute]`.
 * @throws {Error} If the format is invalid.
 */
export function parseDatetime(datetime: string): [number, number, number, number, number] {
  const match = datetime.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) {
    throw new Error(
      `Invalid datetime format: ${datetime}. Expected "YYYY-MM-DD HH:MM" or "YYYY-MM-DD HH:MM:SS"`,
    );
  }
  return [
    parseInt(match[1]!, 10),
    parseInt(match[2]!, 10),
    parseInt(match[3]!, 10),
    parseInt(match[4]!, 10),
    parseInt(match[5]!, 10),
  ];
}
