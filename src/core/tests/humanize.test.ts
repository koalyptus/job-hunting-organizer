import { describe, it, expect } from 'vitest';
import { humanize, EM_DASH } from '../humanize.js';

// The minimum chain that triggers the rewrite: 3 em-dashes in a row.
const CHAIN = EM_DASH.repeat(3);

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

  it('rewrites a run of 3+ em-dashes to a comma', () => {
    const input = 'I build scalable systems' + CHAIN + 'and I leverage Go.';
    expect(humanize(input)).toBe('I build scalable systems, and I leverage Go.');
  });

  it('leaves 1-2 em-dashes alone', () => {
    const input = 'I build scalable systems' + EM_DASH + 'and I leverage Go.';
    expect(humanize(input)).toBe(input);
  });

  it('leaves scattered em-dashes alone (no comma splices)', () => {
    // 3 em-dashes total, but never 3 in a row: legitimate parenthetical usage.
    const input =
      'The system' +
      EM_DASH +
      'built in 2021' +
      EM_DASH +
      'handles it. One more' +
      EM_DASH +
      'note.';
    expect(humanize(input)).toBe(input);
  });

  it('spaces commas from an em-dash rewrite like normal prose', () => {
    const input = 'One' + CHAIN + 'two' + CHAIN + 'three' + CHAIN + 'four.';
    expect(humanize(input)).toBe('One, two, three, four.');
  });

  it('preserves numeric thousands separators when rewriting chains', () => {
    const input = 'I scaled to 10,000 users' + CHAIN + 'for the web.';
    expect(humanize(input)).toBe('I scaled to 10,000 users, for the web.');
  });

  it('collapses comma runs left next to the rewrite', () => {
    const input = 'a' + CHAIN + ',' + CHAIN + 'b';
    expect(humanize(input)).toBe('a, b');
  });

  it('drops a comma before a period or closing paren', () => {
    expect(humanize('Hello' + CHAIN + '.')).toBe('Hello.');
    expect(humanize('(x' + CHAIN + ')')).toBe('(x)');
  });

  it('keeps a single space before an opening paren', () => {
    const input = 'Built in Go' + CHAIN + '(released 2024).';
    expect(humanize(input)).toBe('Built in Go (released 2024).');
  });

  it('drops a dangling em-dash chain at end of text', () => {
    expect(humanize('The end' + CHAIN)).toBe('The end');
  });

  it('drops a comma before ! or ?', () => {
    expect(humanize('No way' + CHAIN + '!')).toBe('No way!');
    expect(humanize('Really' + CHAIN + '?')).toBe('Really?');
  });

  it('drops a dangling em-dash chain at end of line', () => {
    expect(humanize('The end' + CHAIN + '\nnext line.')).toBe('The end\nnext line.');
    expect(humanize('The end' + CHAIN + '\r\nnext line.')).toBe('The end\r\nnext line.');
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
    const input =
      'I build scalable systems' +
      CHAIN +
      'and I leverage Go' +
      CHAIN +
      'for the modern web' +
      CHAIN +
      'at scale.  At its core, I am a strong fit.';
    const expected =
      'I build scalable systems, and I leverage Go, for the modern web, at scale. At its core, I am a strong fit.';
    expect(humanize(input)).toBe(expected);
  });

  it('is idempotent', () => {
    const input =
      'A' + CHAIN + 'b' + CHAIN + 'c' + CHAIN + 'd.   “quoted”  ‘apos’\n\n\n\ntrailing   ';
    const once = humanize(input);
    expect(humanize(once)).toBe(once);
  });
});
