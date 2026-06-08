import { describe, expect, it } from 'vitest';
import { formatDateUtc, parseDateOrNow } from '../date.js';

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
