import { describe, it, expect } from 'vitest';
import { humanize, countOccurrences } from '../humanize.js';

// Build the em dash from a code point so the literal never depends on the
// test transform's Unicode handling (the transform drops raw em-dash chars
// in string literals, but keeps explicit escapes/code points).
const EM_DASH = String.fromCodePoint(0x2014);

describe('humanize', () => {
  it('returns empty input unchanged', () => {
    expect(humanize('')).toBe('');
  });

  it('strips trailing whitespace on whitespace-only lines', () => {
    expect(humanize('   \n\t  ')).toBe('\n');
  });

  it('leaves text with no tells unchanged', () => {
    const text = 'I built a real-time chat system in Go for the modern web.';
    expect(humanize(text)).toBe(text);
  });

  it('collapses 3+ em-dashes to commas', () => {
    const input =
      'I build scalable systems' +
      EM_DASH +
      'and I leverage Go' +
      EM_DASH +
      'for the modern web' +
      EM_DASH +
      'at scale.';
    const expected = 'I build scalable systems, and I leverage Go, for the modern web, at scale.';
    expect(humanize(input)).toBe(expected);
  });

  it('leaves 1-2 em-dashes alone', () => {
    const input = 'I build scalable systems' + EM_DASH + 'and I leverage Go.';
    expect(humanize(input)).toBe(input);
  });

  it('collapses spaces after em-dash rewrite', () => {
    const input = 'One' + EM_DASH + 'two' + EM_DASH + 'three' + EM_DASH + 'four.';
    expect(humanize(input)).toBe('One, two, three, four.');
  });

  it('collapses adjacent commas from neighboring em-dashes', () => {
    const input = 'a' + EM_DASH + 'b' + EM_DASH + 'c' + EM_DASH + 'd';
    expect(humanize(input)).toBe('a, b, c, d');
  });

  it('does not leave a comma before a period or closing paren', () => {
    // 3+ em-dashes so the rule triggers; verifies comma-before-paren is dropped.
    const input =
      'Built in Go' + EM_DASH + '(released 2024)' + EM_DASH + 'and in Rust' + EM_DASH + 'today.';
    expect(humanize(input)).toBe('Built in Go(released 2024), and in Rust, today.');
  });

  it('collapses runs of 2+ spaces to a single space', () => {
    const input = 'Too    many     spaces.';
    expect(humanize(input)).toBe('Too many spaces.');
  });

  it('collapses 3+ newlines to two', () => {
    const input = 'Para one.\n\n\n\n\nPara two.';
    expect(humanize(input)).toBe('Para one.\n\nPara two.');
  });

  it('strips trailing whitespace on each line', () => {
    const input = 'Line one.   \nLine two.\t\n';
    expect(humanize(input)).toBe('Line one.\nLine two.\n');
  });

  it('normalizes smart double quotes to straight', () => {
    const input = 'She said “hello” and “goodbye”.';
    expect(humanize(input)).toBe('She said "hello" and "goodbye".');
  });

  it('normalizes smart single quotes and apostrophes to straight', () => {
    const input = 'It’s the ‘best’ one.';
    expect(humanize(input)).toBe("It's the 'best' one.");
  });

  it('normalizes guillemets to straight double quotes', () => {
    const input = 'He wrote «cite» and ‹note›.';
    expect(humanize(input)).toBe('He wrote "cite" and "note".');
  });

  it('applies all fixes together (the plan example)', () => {
    // Uses 3 em-dashes so the rule triggers; mirrors the plan's before/after
    // but with the 3+ threshold applied.
    const input =
      'I build scalable systems' +
      EM_DASH +
      'and I leverage Go' +
      EM_DASH +
      'for the modern web' +
      EM_DASH +
      'at scale.  At its core, I am a strong fit.';
    const expected =
      'I build scalable systems, and I leverage Go, for the modern web, at scale. At its core, I am a strong fit.';
    expect(humanize(input)).toBe(expected);
  });

  it('is idempotent', () => {
    const input =
      'A' + EM_DASH + 'b' + EM_DASH + 'c' + EM_DASH + 'd.   “quoted”  ‘apos’\n\n\n\ntrailing   ';
    const once = humanize(input);
    expect(humanize(once)).toBe(once);
  });

  it('countOccurrences returns 0 for an empty needle', () => {
    expect(countOccurrences('any text', '')).toBe(0);
  });

  it('countOccurrences returns 0 when the needle is absent', () => {
    expect(countOccurrences('no dashes here', EM_DASH)).toBe(0);
  });

  it('countOccurrences counts non-overlapping occurrences', () => {
    expect(countOccurrences('a' + EM_DASH + 'b' + EM_DASH + 'c', EM_DASH)).toBe(2);
    // Overlapping candidates are not double-counted.
    expect(countOccurrences('aaaa', 'aa')).toBe(2);
  });
});
