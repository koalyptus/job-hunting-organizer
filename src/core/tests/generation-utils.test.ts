import { describe, expect, it } from 'vitest';
import { countWords, extractJdContent, isRefusal } from '../generation-utils.js';

describe('extractJdContent', () => {
  it('returns the fetched-jd region when present', () => {
    const content = [
      '<!-- jho:start:fetched-jd -->',
      'Senior backend role at Acme.',
      '<!-- jho:end:fetched-jd -->',
      'rest below',
    ].join('\n');
    expect(extractJdContent(content)).toBe('Senior backend role at Acme.');
  });

  it('returns the full content when no region marker exists', () => {
    const content = 'Just some free text with no markers.';
    expect(extractJdContent(content)).toBe(content);
  });

  it('returns full content for empty input', () => {
    expect(extractJdContent('')).toBe('');
  });
});

describe('isRefusal', () => {
  it('detects a refusal pattern', () => {
    expect(isRefusal('I cannot generate that without a profile')).toBe(true);
    expect(isRefusal('As a language model, I am unable to help')).toBe(true);
  });

  it('returns false for normal content', () => {
    expect(isRefusal('Here is your tailored cover letter.')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isRefusal('I CANNOT do that')).toBe(true);
  });
});

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('one two three')).toBe(3);
  });

  it('ignores extra whitespace', () => {
    expect(countWords('  one   two  ')).toBe(2);
  });

  it('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0);
  });
});
