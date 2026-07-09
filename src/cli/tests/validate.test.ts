import { describe, expect, it } from 'vitest';
import { validateTailOption, validateLevelOption, validateDatetime } from '../validate.js';

describe('validateTailOption', () => {
  it('accepts positive integers', () => {
    expect(validateTailOption('1')).toBeNull();
    expect(validateTailOption('10')).toBeNull();
    expect(validateTailOption('100')).toBeNull();
  });

  it('rejects zero', () => {
    expect(validateTailOption('0')).toBe('--tail must be a positive integer');
  });

  it('rejects negative numbers', () => {
    expect(validateTailOption('-1')).toBe('--tail must be a positive integer');
    expect(validateTailOption('-10')).toBe('--tail must be a positive integer');
  });

  it('rejects non-numeric strings', () => {
    expect(validateTailOption('abc')).toBe('--tail must be a positive integer');
    expect(validateTailOption('1.5')).toBe('--tail must be a positive integer');
  });

  it('rejects empty string', () => {
    expect(validateTailOption('')).toBe('--tail must be a positive integer');
  });
});

describe('validateLevelOption', () => {
  it('accepts valid levels (case insensitive)', () => {
    expect(validateLevelOption('fatal')).toBeNull();
    expect(validateLevelOption('error')).toBeNull();
    expect(validateLevelOption('warn')).toBeNull();
    expect(validateLevelOption('info')).toBeNull();
    expect(validateLevelOption('debug')).toBeNull();
    expect(validateLevelOption('trace')).toBeNull();
    expect(validateLevelOption('FATAL')).toBeNull();
    expect(validateLevelOption('Error')).toBeNull();
    expect(validateLevelOption('Warn')).toBeNull();
  });

  it('rejects invalid levels', () => {
    expect(validateLevelOption('invalid')).toBe(
      '--level must be one of: fatal, error, warn, info, debug, trace',
    );
    expect(validateLevelOption('warning')).toBe(
      '--level must be one of: fatal, error, warn, info, debug, trace',
    );
    expect(validateLevelOption('verbose')).toBe(
      '--level must be one of: fatal, error, warn, info, debug, trace',
    );
  });

  it('rejects empty string', () => {
    expect(validateLevelOption('')).toBe(
      '--level must be one of: fatal, error, warn, info, debug, trace',
    );
  });
});

describe('validateDatetime', () => {
  it('accepts valid datetime without seconds', () => {
    expect(validateDatetime('2026-06-15 10:00')).toBeNull();
    expect(validateDatetime('2026-12-31 23:59')).toBeNull();
    expect(validateDatetime('2026-01-01 00:00')).toBeNull();
  });

  it('accepts valid datetime with seconds', () => {
    expect(validateDatetime('2026-06-15 10:30:45')).toBeNull();
    expect(validateDatetime('2026-12-31 23:59:59')).toBeNull();
  });

  it('rejects non-datetime strings', () => {
    expect(validateDatetime('not-a-date')).toBe(
      'must be "YYYY-MM-DD HH:MM" or "YYYY-MM-DD HH:MM:SS"',
    );
    expect(validateDatetime('2026/06/15 10:00')).toBe(
      'must be "YYYY-MM-DD HH:MM" or "YYYY-MM-DD HH:MM:SS"',
    );
    expect(validateDatetime('2026-06-15')).toBe(
      'must be "YYYY-MM-DD HH:MM" or "YYYY-MM-DD HH:MM:SS"',
    );
    expect(validateDatetime('10:00')).toBe('must be "YYYY-MM-DD HH:MM" or "YYYY-MM-DD HH:MM:SS"');
  });

  it('rejects invalid month', () => {
    expect(validateDatetime('2026-00-15 10:00')).toBe('month must be 01-12');
    expect(validateDatetime('2026-13-15 10:00')).toBe('month must be 01-12');
    expect(validateDatetime('2026-99-15 10:00')).toBe('month must be 01-12');
  });

  it('rejects invalid day', () => {
    expect(validateDatetime('2026-06-00 10:00')).toBe('day must be 01-31');
    expect(validateDatetime('2026-06-32 10:00')).toBe('day must be 01-31');
    expect(validateDatetime('2026-06-99 10:00')).toBe('day must be 01-31');
  });

  it('rejects invalid hour', () => {
    expect(validateDatetime('2026-06-15 24:00')).toBe('hour must be 00-23');
    expect(validateDatetime('2026-06-15 25:00')).toBe('hour must be 00-23');
  });

  it('rejects invalid minute', () => {
    expect(validateDatetime('2026-06-15 10:60')).toBe('minute must be 00-59');
    expect(validateDatetime('2026-06-15 10:99')).toBe('minute must be 00-59');
  });

  it('rejects invalid second', () => {
    expect(validateDatetime('2026-06-15 10:30:60')).toBe('second must be 00-59');
    expect(validateDatetime('2026-06-15 10:30:99')).toBe('second must be 00-59');
  });

  it('rejects 31 days for 30-day months', () => {
    expect(validateDatetime('2026-04-31 10:00')).toBe('Apr has at most 30 days');
    expect(validateDatetime('2026-06-31 10:00')).toBe('Jun has at most 30 days');
    expect(validateDatetime('2026-09-31 10:00')).toBe('Sep has at most 30 days');
    expect(validateDatetime('2026-11-31 10:00')).toBe('Nov has at most 30 days');
  });

  it('rejects days > 28/29 for February', () => {
    expect(validateDatetime('2026-02-29 10:00')).toBe('Feb has at most 28 days');
    expect(validateDatetime('2026-02-30 10:00')).toBe('Feb has at most 28 days');
    expect(validateDatetime('2026-02-31 10:00')).toBe('Feb has at most 28 days');
    expect(validateDatetime('2024-02-30 10:00')).toBe('Feb has at most 29 days');
    expect(validateDatetime('2024-02-31 10:00')).toBe('Feb has at most 29 days');
  });

  it('accepts February 29 in leap years', () => {
    expect(validateDatetime('2024-02-29 10:00')).toBeNull();
    expect(validateDatetime('2000-02-29 10:00')).toBeNull();
  });

  it('rejects February 29 in non-leap years', () => {
    expect(validateDatetime('2026-02-29 10:00')).toBe('Feb has at most 28 days');
    expect(validateDatetime('1900-02-29 10:00')).toBe('Feb has at most 28 days');
  });
});
