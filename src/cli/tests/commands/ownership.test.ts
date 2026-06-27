import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderOwnership } from '../../../core/ownership.js';
import { runCommand } from '../helpers.js';
import { ownershipCommand } from '../../commands/ownership.js';

const ESC = '\u001b';

describe('renderOwnership', () => {
  it('produces a table with expected columns', () => {
    const out = renderOwnership({ configPath: '/tmp/cfg.json' });
    expect(out).toContain('File');
    expect(out).toContain('Tool writes');
    expect(out).toContain('Edit freely?');
    expect(out).toContain('meta.md');
    expect(out).toContain('jd.md');
    expect(out).toContain('cover-letter.md');
  });

  it('produces markdown table with --markdown', () => {
    const out = renderOwnership({ markdown: true, configPath: '/tmp/cfg.json' });
    expect(out).toContain('| File');
    expect(out).toContain('| --- |');
  });

  it('applies colorize functions when provided', () => {
    const bold = (s: string) => `${ESC}[1m${s}${ESC}[22m`;
    const cyan = (s: string) => `${ESC}[36m${s}${ESC}[39m`;
    const out = renderOwnership({
      configPath: '/tmp/cfg.json',
      colorize: { bold, cyan },
    });
    // Headers are bold
    expect(out).toContain(`${ESC}[1mFile${ESC}[22m`);
    // File column is cyan (opening code on the first line)
    expect(out).toContain(`${ESC}[36mmeta.md (the metadata fields${ESC}[39m`);
  });
});

describe('ownership command', () => {
  beforeEach(() => {
    vi.stubEnv('NO_COLOR', '1');
  });

  it('prints ownership table to stdout', async () => {
    const { stdout, stderr, exitCode } = await runCommand(ownershipCommand, ['ownership']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('File');
    expect(stdout).toContain('Tool writes');
    expect(stdout).toContain('Edit freely?');
    expect(stdout).toMatch(/[┌┐└┘├┤┬┴┼─]/);
    expect(stderr).toBe('');
  });

  it('prints markdown table with --markdown', async () => {
    const { stdout, stderr, exitCode } = await runCommand(ownershipCommand, [
      'ownership',
      '--markdown',
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('# File ownership');
    expect(stdout).toContain('| File');
    expect(stdout).toContain('| --- |');
    expect(stderr).toBe('');
  });
});
