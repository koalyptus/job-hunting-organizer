import { describe, expect, it } from 'vitest';
import { OWNERSHIP_ROWS, renderOwnership } from '../ownership.js';

const ESC = '\u001b';

describe('OWNERSHIP_ROWS', () => {
  it('has no duplicate file entries', () => {
    const seen = new Set<string>();
    for (const row of OWNERSHIP_ROWS) {
      expect(seen.has(row.file)).toBe(false);
      seen.add(row.file);
    }
  });

  it('covers the planned application files', () => {
    const files = OWNERSHIP_ROWS.map((r) => r.file);
    expect(files).toContain('meta.md (the metadata fields at the top)');
    expect(files).toContain('meta.md (everything below the metadata fields)');
    expect(files).toContain('jd.md (the auto-fetched job ad, at the top)');
    expect(files).toContain('jd.md (everything below the auto-fetched section)');
    expect(files).toContain('cover-letter.md');
    expect(files).toContain('qa.md');
    expect(files).toContain('interviews.md');
    expect(files).toContain('retro.md');
    expect(files).toContain('prepare.md');
    expect(files).toContain('notes.md');
  });
});

describe('renderOwnership', () => {
  it('produces a console table (cli-table3) by default', () => {
    const out = renderOwnership({ configPath: '/tmp/cfg.json' });
    // Headers and rows are present. We use a short substring for the long
    // `jd.md (... auto-fetched ...)` cell because cli-table3 word-wraps it.
    expect(out).toContain('File');
    expect(out).toContain('Tool writes');
    expect(out).toContain('Edit freely?');
    expect(out).toContain('On your edit');
    expect(out).toContain('meta.md (the metadata fields');
    expect(out).toContain('jd.md (the auto-fetched');
    // cli-table3 uses Unicode box-drawing characters.
    expect(out).toMatch(/[┌┐└┘├┤┬┴┼─]/);
  });

  it('wraps long cell content to keep the table width sane', () => {
    const out = renderOwnership({ configPath: '/tmp/cfg.json' });
    // Total line length should not exceed the configured column widths
    // (30 + 26 + 20 + 36 = 112 cells) plus borders/padding. We give some
    // slack and just assert the output is bounded.
    const lines = out.split('\n').filter((l) => l.length > 0);
    const maxLen = Math.max(...lines.map((l) => l.length));
    expect(maxLen).toBeLessThan(140);
  });

  it('produces a markdown table with --markdown', () => {
    const out = renderOwnership({ markdown: true, configPath: '/tmp/cfg.json' });
    expect(out).toMatch(/^# File ownership/);
    expect(out).toContain('| File');
    expect(out).toMatch(/\| --- \| --- \|/);
    expect(out).toContain('| meta.md (the metadata fields at the top)');
  });

  it('includes the config path in the header', () => {
    const out = renderOwnership({ configPath: '/path/to/config.json' });
    expect(out).toContain('/path/to/config.json');
  });

  it('applies colorize to console table headers and file column', () => {
    const bold = (s: string) => `${ESC}[1m${s}${ESC}[22m`;
    const cyan = (s: string) => `${ESC}[36m${s}${ESC}[39m`;
    const noop = (s: string) => s;
    const out = renderOwnership({
      configPath: '/tmp/cfg.json',
      colorize: {
        bold,
        cyan,
        dim: noop,
        green: noop,
        yellow: noop,
        red: noop,
        statusColor: noop,
        interviewTypeColor: noop,
      },
    });
    // Headers wrapped with bold
    expect(out).toContain(`${ESC}[1mFile${ESC}[22m`);
    expect(out).toContain(`${ESC}[1mTool writes${ESC}[22m`);
    // File column wrapped with cyan
    expect(out).toContain(`${ESC}[36mmeta.md (the metadata fields${ESC}[39m`);
  });

  it('ignores colorize in markdown mode', () => {
    const bold = (s: string) => `${ESC}[1m${s}${ESC}[22m`;
    const cyan = (s: string) => `${ESC}[36m${s}${ESC}[39m`;
    const noop = (s: string) => s;
    const out = renderOwnership({
      markdown: true,
      configPath: '/tmp/cfg.json',
      colorize: {
        bold,
        cyan,
        dim: noop,
        green: noop,
        yellow: noop,
        red: noop,
        statusColor: noop,
        interviewTypeColor: noop,
      },
    });
    // Markdown output has no ANSI codes
    expect(out).not.toContain(ESC);
  });
});
