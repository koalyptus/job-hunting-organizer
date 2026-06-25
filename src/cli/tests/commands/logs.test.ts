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
    await rm(tempDir, { recursive: true, force: true });
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
});
