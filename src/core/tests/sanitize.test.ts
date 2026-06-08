import { describe, expect, it } from 'vitest';
import { sanitizeToken, sanitizeUnbounded } from '../sanitize.js';

describe('sanitizeUnbounded', () => {
  it('lowercases the input', () => {
    expect(sanitizeUnbounded('FooBar')).toBe('foobar');
  });

  it('replaces non-alphanumeric runs with a single hyphen', () => {
    expect(sanitizeUnbounded('foo  bar!!baz')).toBe('foo-bar-baz');
  });

  it('treats & as "and"', () => {
    expect(sanitizeUnbounded('R&D Lead')).toBe('r-and-d-lead');
  });

  it('strips leading and trailing hyphens', () => {
    expect(sanitizeUnbounded('---foo---')).toBe('foo');
    expect(sanitizeUnbounded('  spaces  ')).toBe('spaces');
  });

  it('returns empty string for input with no alphanumeric chars', () => {
    expect(sanitizeUnbounded('!!!')).toBe('');
    expect(sanitizeUnbounded('   ')).toBe('');
  });
});

describe('sanitizeToken', () => {
  it('returns the full cleaned string when it fits within maxLen', () => {
    expect(sanitizeToken('foo bar', 20)).toBe('foo-bar');
  });

  it('truncates to maxLen and drops any trailing hyphen', () => {
    expect(sanitizeToken('foo bar baz', 7)).toBe('foo-bar');
  });

  it('returns empty string for input that produces nothing after sanitization', () => {
    expect(sanitizeToken('!!!', 10)).toBe('');
  });
});
