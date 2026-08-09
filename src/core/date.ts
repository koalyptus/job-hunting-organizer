/**
 * Date helpers for the slug builder and any caller that needs the
 * `YYYY-MMM-DD` format (e.g. cwd slug inference, collision counter keys).
 *
 * Calendar-date formatting uses the *local* timezone. A slug records the
 * day the user applied on, as that user experienced it: formatting in UTC
 * dated morning applications in UTC+N zones (e.g. AEST) to the previous
 * day. Date-only inputs such as `'2026-06-21'` parse as local midnight
 * and format to the same calendar day in every timezone.
 */

/**
 * English month abbreviations, indexed by `Date.getMonth()`.
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
 * Format a `Date` as `YYYY-MMM-DD` in the local timezone.
 * @param d - The date to format. The local calendar components are read.
 * @returns An 11-character string like `2026-Jun-03`.
 */
export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = MONTH_ABBR[d.getMonth()];
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Format a `Date` or date string as a `YYYY-MM-DD` calendar-day key.
 * Dates use the local calendar day; datetime strings are parsed and
 * yield their local calendar day; bare date strings are already the
 * key format and returned as-is.
 * @param input - A Date or ISO date/datetime string.
 * @returns A 10-character string like `2026-06-03`.
 */
export function toDateKey(input: Date | string): string {
  if (typeof input === 'string') {
    const tIdx = input.indexOf('T');
    // Bare date string (no time component) is already the key format.
    if (tIdx === -1) {
      return input;
    }
    // Datetime string: parse it and extract the local calendar day.
    // This matches the Date path behaviour.
    return toDateKey(new Date(input));
  }
  const y = input.getFullYear();
  const m = String(input.getMonth() + 1).padStart(2, '0');
  const day = String(input.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Return today's local calendar day as a `YYYY-MM-DD` key.
 * @returns A 10-character string like `2026-06-03`.
 */
export function todayDateKey(): string {
  return toDateKey(new Date());
}

/** Matches a bare ISO 8601 calendar date with no time or offset. */
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a `Date` from a `Date` instance, an ISO 8601 string, or `undefined`
 * (meaning "now"). Strings are parsed with the platform `Date` constructor,
 * which accepts ISO 8601 and a few other common formats.
 *
 * A date-only string such as `'2026-06-21'` is parsed as *local* midnight
 * rather than the platform default of UTC midnight, so it formats back to
 * the same calendar day in every timezone.
 *
 * Datetime strings with an explicit offset (e.g. `'2026-06-03T00:00:00Z'`)
 * are parsed according to the ISO 8601 specification — the offset is honoured.
 * This differs from the date-only path intentionally: date-only strings
 * represent a calendar day, while datetime strings represent an instant.
 * @param input - The date to parse, or `undefined` for the current time.
 * @returns A `Date`. The input `Date` is returned by reference, not cloned.
 * @throws {Error} If `input` is a string that cannot be parsed or represents
 * an invalid calendar date.
 */
export function parseDateOrNow(input: string | Date | undefined): Date {
  if (input === undefined) {
    return new Date();
  }
  if (input instanceof Date) {
    return input;
  }
  const dateOnly = DATE_ONLY_RE.exec(input);
  if (dateOnly) {
    const year = parseInt(dateOnly[1]!, 10);
    const month = parseInt(dateOnly[2]!, 10);
    const day = parseInt(dateOnly[3]!, 10);
    // Reject obviously invalid calendar components before Date rollover.
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      throw new Error(`invalid date: ${input}`);
    }
    // Local midnight: the regex guarantees three numeric components.
    const d = new Date(year, month - 1, day);
    // Additional check: if the Date rolled over (e.g. 2026-02-31),
    // the components won't match the input.
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
      throw new Error(`invalid date: ${input}`);
    }
    return d;
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
