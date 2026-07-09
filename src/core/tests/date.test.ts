import { describe, expect, it } from 'vitest';
import {
  formatDateUtc,
  parseDateOrNow,
  parseSince,
  toIsoDateString,
  daysInMonth,
  parseDatetime,
} from '../date.js';

describe('formatDateUtc', () => {
  it('formats a UTC date as YYYY-MMM-DD', () => {
    expect(formatDateUtc(new Date(Date.UTC(2026, 5, 3)))).toBe('2026-Jun-03');
  });

  it('zero-pads the day', () => {
    expect(formatDateUtc(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-Jan-01');
  });

  it('uses UTC, not local time', () => {
    // 2026-06-03 23:00 UTC is 2026-06-04 in some local zones. We expect
    // the UTC date in the output, so we set a clearly-UTC noon time.
    const d = new Date(Date.UTC(2026, 5, 3, 12, 0, 0));
    expect(formatDateUtc(d)).toBe('2026-Jun-03');
  });

  it('handles December correctly', () => {
    expect(formatDateUtc(new Date(Date.UTC(2026, 11, 31)))).toBe('2026-Dec-31');
  });
});

describe('parseDateOrNow', () => {
  it('returns the given Date unchanged', () => {
    const d = new Date(Date.UTC(2026, 5, 3));
    expect(parseDateOrNow(d)).toBe(d);
  });

  it('parses an ISO string', () => {
    const d = parseDateOrNow('2026-06-03T00:00:00Z');
    expect(d.toISOString()).toBe('2026-06-03T00:00:00.000Z');
  });

  it('returns now when input is undefined', () => {
    const before = Date.now();
    const d = parseDateOrNow(undefined);
    const after = Date.now();
    expect(d.getTime()).toBeGreaterThanOrEqual(before);
    expect(d.getTime()).toBeLessThanOrEqual(after);
  });

  it('throws on an unparseable string', () => {
    expect(() => parseDateOrNow('not a date')).toThrow(/invalid date/);
  });

  it('throws on an empty string', () => {
    expect(() => parseDateOrNow('')).toThrow(/invalid date/);
  });
});

describe('toIsoDateString', () => {
  it('formats a Date as YYYY-MM-DD', () => {
    expect(toIsoDateString(new Date(Date.UTC(2026, 5, 3)))).toBe('2026-06-03');
  });

  it('truncates an ISO datetime string at T', () => {
    expect(toIsoDateString('2026-06-03T12:30:00Z')).toBe('2026-06-03');
  });

  it('passes through an ISO date-only string', () => {
    expect(toIsoDateString('2026-06-03')).toBe('2026-06-03');
  });
});

describe('parseSince', () => {
  const now = new Date(Date.UTC(2026, 5, 28)); // 2026-06-28

  it('parses a relative duration like 7d', () => {
    const d = parseSince('7d', now);
    expect(d.toISOString()).toBe('2026-06-21T00:00:00.000Z');
  });

  it('parses 30d', () => {
    const d = parseSince('30d', now);
    expect(d.toISOString()).toBe('2026-05-29T00:00:00.000Z');
  });

  it('parses 90d', () => {
    const d = parseSince('90d', now);
    expect(d.toISOString()).toBe('2026-03-30T00:00:00.000Z');
  });

  it('parses 1d', () => {
    const d = parseSince('1d', now);
    expect(d.toISOString()).toBe('2026-06-27T00:00:00.000Z');
  });

  it('parses an ISO date string', () => {
    const d = parseSince('2026-01-15', now);
    expect(d.toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  it('throws on an invalid string', () => {
    expect(() => parseSince('invalid', now)).toThrow(/invalid date/);
  });

  it('throws on an empty string', () => {
    expect(() => parseSince('')).toThrow(/invalid date/);
  });
});

describe('daysInMonth', () => {
  it('returns 31 for January', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
  });

  it('returns 28 for February in non-leap year', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it('returns 29 for February in leap year', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
  });

  it('returns 29 for century leap year (2000)', () => {
    expect(daysInMonth(2000, 2)).toBe(29);
  });

  it('returns 28 for non-leap century year (1900)', () => {
    expect(daysInMonth(1900, 2)).toBe(28);
  });

  it('returns 30 for April', () => {
    expect(daysInMonth(2026, 4)).toBe(30);
  });

  it('returns 30 for June', () => {
    expect(daysInMonth(2026, 6)).toBe(30);
  });

  it('returns 30 for September', () => {
    expect(daysInMonth(2026, 9)).toBe(30);
  });

  it('returns 30 for November', () => {
    expect(daysInMonth(2026, 11)).toBe(30);
  });

  it('returns 31 for December', () => {
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('parseDatetime', () => {
  it('parses YYYY-MM-DD HH:MM', () => {
    expect(parseDatetime('2026-06-15 10:00')).toEqual([2026, 6, 15, 10, 0]);
  });

  it('parses YYYY-MM-DD HH:MM:SS (ignores seconds)', () => {
    expect(parseDatetime('2026-06-15 10:30:45')).toEqual([2026, 6, 15, 10, 30]);
  });

  it('throws on invalid format', () => {
    expect(() => parseDatetime('not-a-date')).toThrow(/Invalid datetime format/);
    expect(() => parseDatetime('2026/06/15 10:00')).toThrow(/Invalid datetime format/);
    expect(() => parseDatetime('2026-06-15')).toThrow(/Invalid datetime format/);
  });
});
