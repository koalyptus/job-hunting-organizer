import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DEFAULT_LOG_FILENAME } from '../../../core/types.js';
import { logsCommand } from '../../commands/logs.js';
import { runCommand } from '../helpers.js';

describe('logs command', () => {
  let tempDir: string;
  let logFile: string;
  const originalConfigHome = process.env['JHO_CONFIG_HOME'];

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'jho-logs-test-'));
    logFile = resolve(tempDir, DEFAULT_LOG_FILENAME);
    process.env['JHO_CONFIG_HOME'] = tempDir;
  });

  afterEach(async () => {
    if (originalConfigHome === undefined) {
      delete process.env['JHO_CONFIG_HOME'];
    } else {
      process.env['JHO_CONFIG_HOME'] = originalConfigHome;
    }
    if (process.platform === 'win32') {
      // On Windows, the pino file destination may hold the log file open
      // briefly after the command completes, causing rm to fail with
      // ENOTEMPTY. Retry with exponential backoff.
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await rm(tempDir, { recursive: true, force: true });
          break;
        } catch (err: unknown) {
          if (attempt === 4 || (err as NodeJS.ErrnoException).code !== 'ENOTEMPTY') {
            throw err;
          }
          await new Promise((r) => setTimeout(r, 50 * 2 ** attempt));
        }
      }
    } else {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('--path prints the log file location', async () => {
    const result = await runCommand(logsCommand, ['logs', '--path']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(logFile);
  });

  it('reports missing log file', async () => {
    const result = await runCommand(logsCommand, ['logs']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No log file at');
  });

  it('pretty-prints log entries via pino-pretty', async () => {
    const entry = {
      level: 50,
      time: Date.now(),
      pid: 12345,
      hostname: 'test-host',
      cid: 'cli',
      cmd: 'track',
      err: {
        type: 'SlugMissingError',
        message: 'missing slug',
      },
      msg: 'track.slug-missing',
    };
    await writeFile(logFile, `${JSON.stringify(entry)}\n`, 'utf8');

    const result = await runCommand(logsCommand, ['logs']);
    expect(result.exitCode).toBe(0);
    // pino-pretty output format: [time] LEVEL (cid):
    expect(result.stdout).toContain('ERROR');
    expect(result.stdout).toContain('track.slug-missing');
    // The err object should be pretty-printed too
    expect(result.stdout).toContain('SlugMissingError');
    expect(result.stdout).toContain('missing slug');
  });

  it('--tail limits to last N entries', async () => {
    const lines: string[] = [];
    for (let i = 0; i < 10; i++) {
      lines.push(
        JSON.stringify({
          level: 30,
          time: Date.now(),
          msg: `entry ${i}`,
        }),
      );
    }
    await writeFile(logFile, `${lines.join('\n')}\n`, 'utf8');

    const result = await runCommand(logsCommand, ['logs', '--tail', '3']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('entry 7');
    expect(result.stdout).toContain('entry 8');
    expect(result.stdout).toContain('entry 9');
    expect(result.stdout).not.toContain('entry 0');
  });

  it('--json outputs raw JSON lines (cat-like)', async () => {
    const entry = { level: 30, time: Date.now(), msg: 'test message' };
    await writeFile(logFile, `${JSON.stringify(entry)}\n`, 'utf8');

    const result = await runCommand(logsCommand, ['logs', '--json']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"msg":"test message"');
    // Should NOT contain pino-pretty formatting
    expect(result.stdout).not.toContain('INFO');
  });

  it('handles empty log file', async () => {
    await writeFile(logFile, '', 'utf8');
    const result = await runCommand(logsCommand, ['logs']);
    expect(result.exitCode).toBe(0);
    // Empty file -> empty output (pino-pretty produces nothing for empty input)
    expect(result.stdout).toBe('');
  });

  it('--level filters by minimum level', async () => {
    const entries = [
      { level: 10, time: Date.now(), msg: 'trace entry' },
      { level: 20, time: Date.now(), msg: 'debug entry' },
      { level: 30, time: Date.now(), msg: 'info entry' },
      { level: 40, time: Date.now(), msg: 'warn entry' },
      { level: 50, time: Date.now(), msg: 'error entry' },
    ];
    await writeFile(logFile, `${entries.map((e) => JSON.stringify(e)).join('\n')}\n`, 'utf8');

    const result = await runCommand(logsCommand, ['logs', '--json', '--level', 'warn']);
    expect(result.exitCode).toBe(0);
    // --level is a minimum filter: includes warn (40) and error (50)
    expect(result.stdout).toContain('"msg":"warn entry"');
    expect(result.stdout).toContain('"msg":"error entry"');
    // Excludes info (30), debug (20), trace (10)
    expect(result.stdout).not.toContain('"msg":"info entry"');
    expect(result.stdout).not.toContain('"msg":"debug entry"');
    expect(result.stdout).not.toContain('"msg":"trace entry"');
  });

  it('--level rejects invalid level', async () => {
    const entry = { level: 30, time: Date.now(), msg: 'test' };
    await writeFile(logFile, `${JSON.stringify(entry)}\n`, 'utf8');

    const result = await runCommand(logsCommand, ['logs', '--level', 'invalid']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--level must be one of');
  });

  it('--tail rejects non-numeric value', async () => {
    const entry = { level: 30, time: Date.now(), msg: 'test' };
    await writeFile(logFile, `${JSON.stringify(entry)}\n`, 'utf8');

    const result = await runCommand(logsCommand, ['logs', '--tail', 'abc']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--tail must be a positive integer');
  });

  it('--tail rejects zero', async () => {
    const entry = { level: 30, time: Date.now(), msg: 'test' };
    await writeFile(logFile, `${JSON.stringify(entry)}\n`, 'utf8');

    const result = await runCommand(logsCommand, ['logs', '--tail', '0']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--tail must be a positive integer');
  });

  it('--tail rejects negative number', async () => {
    const entry = { level: 30, time: Date.now(), msg: 'test' };
    await writeFile(logFile, `${JSON.stringify(entry)}\n`, 'utf8');

    const result = await runCommand(logsCommand, ['logs', '--tail', '-5']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--tail must be a positive integer');
  });

  it('pretty-prints INFO level entries', async () => {
    const entry = { level: 30, time: Date.now(), msg: 'info message' };
    await writeFile(logFile, `${JSON.stringify(entry)}\n`, 'utf8');

    const result = await runCommand(logsCommand, ['logs']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('INFO');
    expect(result.stdout).toContain('info message');
  });
});
