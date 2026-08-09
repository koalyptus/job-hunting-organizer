import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MONTH_ABBR,
  formatDate,
  todayDateKey,
  parseDateOrNow,
  parseSince,
  toDateKey,
  daysInMonth,
  parseDatetime,
} from '../date.js';

describe('formatDate', () => {
  it('formats a local date as YYYY-MMM-DD', () => {
    expect(formatDate(new Date(2026, 5, 3))).toBe('2026-Jun-03');
  });

  it('zero-pads the day', () => {
    expect(formatDate(new Date(2026, 0, 1))).toBe('2026-Jan-01');
  });

  it('uses the local calendar day, not the UTC day', () => {
    // A morning instant in UTC+10 still falls on the previous day in UTC.
    // The slug must record the day the user experienced.
    const d = new Date('2026-08-09T09:00:00+10:00');
    expect(d.getUTCDate()).toBe(8);
    expect(formatDate(d)).toBe(`${d.getFullYear()}-Aug-${String(d.getDate()).padStart(2, '0')}`);
  });

  it('never disagrees with the local calendar components', () => {
    const instants = [
      new Date('2026-08-09T09:00:00+10:00'),
      new Date('2026-01-01T00:30:00+13:00'),
      new Date('2026-12-31T23:30:00-05:00'),
    ];
    for (const d of instants) {
      const expected = `${d.getFullYear()}-${MONTH_ABBR[d.getMonth()]}-${String(
        d.getDate(),
      ).padStart(2, '0')}`;
      expect(formatDate(d)).toBe(expected);
    }
  });

  it('handles December correctly', () => {
    expect(formatDate(new Date(2026, 11, 31))).toBe('2026-Dec-31');
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

  it('parses a date-only string as local midnight', () => {
    const d = parseDateOrNow('2026-06-21');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(21);
    expect(d.getHours()).toBe(0);
  });

  it('round-trips a date-only string through formatDate', () => {
    expect(formatDate(parseDateOrNow('2026-06-21'))).toBe('2026-Jun-21');
    expect(formatDate(parseDateOrNow('2026-01-01'))).toBe('2026-Jan-01');
    expect(formatDate(parseDateOrNow('2026-12-31'))).toBe('2026-Dec-31');
  });

  it('still honours an explicit offset in a full datetime string', () => {
    const d = parseDateOrNow('2026-06-03T00:00:00Z');
    expect(d.toISOString()).toBe('2026-06-03T00:00:00.000Z');
  });

  it('throws on an unparseable string', () => {
    expect(() => parseDateOrNow('not a date')).toThrow(/invalid date/);
  });

  it('throws on an empty string', () => {
    expect(() => parseDateOrNow('')).toThrow(/invalid date/);
  });

  it('rejects invalid month/day combinations in date-only strings', () => {
    expect(() => parseDateOrNow('2026-13-01')).toThrow(/invalid date/);
    expect(() => parseDateOrNow('2026-02-30')).toThrow(/invalid date/);
    expect(() => parseDateOrNow('2026-04-31')).toThrow(/invalid date/);
    expect(() => parseDateOrNow('2026-00-15')).toThrow(/invalid date/);
    expect(() => parseDateOrNow('2026-06-00')).toThrow(/invalid date/);
  });
});

describe('todayDateKey', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns today's local calendar date, not the UTC date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T09:00:00+10:00'));
    const now = new Date();
    expect(todayDateKey()).toBe(
      `${now.getFullYear()}-08-${String(now.getDate()).padStart(2, '0')}`,
    );
  });
});

describe('toDateKey', () => {
  it('formats a Date as YYYY-MM-DD', () => {
    expect(toDateKey(new Date(2026, 5, 3))).toBe('2026-06-03');
  });

  it('uses the local calendar day for a morning UTC+10 instant', () => {
    const d = new Date('2026-08-09T09:00:00+10:00');
    expect(toDateKey(d)).toBe(`${d.getFullYear()}-08-${String(d.getDate()).padStart(2, '0')}`);
  });

  it('parses a datetime string to its local calendar day (consistent with Date path)', () => {
    // '2026-06-03T12:30:00Z' at 12:30 UTC is 22:30 UTC+10 (same day)
    // The key should be the local calendar day of that instant.
    const instant = '2026-06-03T12:30:00Z';
    const d = new Date(instant);
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    expect(toDateKey(instant)).toBe(expected);
    expect(toDateKey(d)).toBe(expected);
  });

  it('passes through an ISO date-only string', () => {
    expect(toDateKey('2026-06-03')).toBe('2026-06-03');
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

  it('parses an ISO date string as local midnight', () => {
    const d = parseSince('2026-01-15', now);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(0);
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
