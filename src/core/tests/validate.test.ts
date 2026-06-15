import { describe, expect, it } from 'vitest';
import { validateName, validateSlug } from '../validate.js';

describe('validateName', () => {
  it('accepts valid names', () => {
    expect(validateName('default')).toBeNull();
    expect(validateName('my-campaign')).toBeNull();
    expect(validateName('freelance2024')).toBeNull();
    expect(validateName('a')).toBeNull();
  });

  it('rejects empty string', () => {
    expect(validateName('')).toBe('must not be empty or whitespace-only');
  });

  it('rejects whitespace-only', () => {
    expect(validateName('   ')).toBe('must not be empty or whitespace-only');
  });

  it('rejects leading/trailing whitespace', () => {
    expect(validateName(' name')).toBe('must not have leading or trailing whitespace');
    expect(validateName('name ')).toBe('must not have leading or trailing whitespace');
  });

  it('rejects internal whitespace', () => {
    expect(validateName('my campaign')).toBe('must not contain whitespace');
  });

  it('rejects leading dash', () => {
    expect(validateName('-name')).toBe('must not start with a dash');
  });

  it('rejects "." and ".."', () => {
    expect(validateName('.')).toBe('must not be "." or ".."');
    expect(validateName('..')).toBe('must not be "." or ".."');
  });

  it('rejects dots', () => {
    expect(validateName('campaign.name')).toBe('must not contain dots');
  });

  it('rejects names exceeding 64 characters', () => {
    const long = 'a'.repeat(65);
    expect(validateName(long)).toBe('must not exceed 64 characters');
  });

  it('accepts names at exactly 64 characters', () => {
    const exact = 'a'.repeat(64);
    expect(validateName(exact)).toBeNull();
  });

  it('rejects forward slash', () => {
    expect(validateName('campaign/sub')).toBe('must not contain "/"');
  });

  it('rejects backslash', () => {
    expect(validateName('campaign\\sub')).toBe('must not contain "\\"');
  });
});

describe('validateSlug', () => {
  it('accepts valid slug', () => {
    expect(validateSlug('2026-Jun-15-senior-backend-acme')).toEqual({ ok: true });
  });

  it('rejects non-matching pattern', () => {
    expect(validateSlug('not-a-slug')).toEqual({
      ok: false,
      reason: 'does not match YYYY-MMM-DD-* pattern',
    });
  });

  it('rejects invalid month abbreviation', () => {
    expect(validateSlug('2026-Xxx-15-senior-backend-acme')).toEqual({
      ok: false,
      reason: 'invalid month abbreviation: Xxx',
    });
  });

  it('rejects invalid day', () => {
    expect(validateSlug('2026-Jun-32-senior-backend-acme')).toEqual({
      ok: false,
      reason: 'invalid day: 32',
    });
  });

  it('rejects day 0', () => {
    expect(validateSlug('2026-Jun-00-senior-backend-acme')).toEqual({
      ok: false,
      reason: 'invalid day: 00',
    });
  });

  it('rejects invalid year', () => {
    expect(validateSlug('1899-Jun-15-senior-backend-acme')).toEqual({
      ok: false,
      reason: 'invalid year: 1899',
    });
  });

  it('accepts year 9999', () => {
    expect(validateSlug('9999-Jun-15-senior-backend-acme')).toEqual({ ok: true });
  });

  it('rejects year above 9999', () => {
    expect(validateSlug('10000-Jun-15-senior-backend-acme')).toEqual({
      ok: false,
      reason: 'does not match YYYY-MMM-DD-* pattern',
    });
  });
});
