import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { clearConfigCache } from '../../../core/config.js';
import { configCommand } from '../../commands/config.js';

describe('config command', () => {
  let testHome: string;
  let originalJhoConfigHome: string | undefined;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-cfg-'));
    process.env['JHO_CONFIG_HOME'] = join(testHome, '.jho');
    process.env['JHO_DATA'] = join(testHome, 'data');
    clearConfigCache();

    await mkdir(join(testHome, '.jho'), { recursive: true });
    await writeFile(
      join(testHome, '.jho', 'config.json'),
      JSON.stringify({
        version: 1,
        dataRoot: join(testHome, 'data'),
        llm: { baseUrl: 'http://localhost:11434/v1', apiKey: 'secret-key', model: 'llama3' },
        github: { user: 'testuser', token: 'ghp_secret', repos: [] },
        calendar: {
          defaultProvider: 'ics',
          outlook: { tenantId: '', clientId: '', clientSecret: '' },
        },
        logging: { level: 'info', file: '', redactPaths: [] },
      }),
    );
  });

  afterEach(async () => {
    clearConfigCache();
    if (originalJhoConfigHome === undefined) {
      delete process.env['JHO_CONFIG_HOME'];
    } else {
      process.env['JHO_CONFIG_HOME'] = originalJhoConfigHome;
    }
    if (originalJhoData === undefined) {
      delete process.env['JHO_DATA'];
    } else {
      process.env['JHO_DATA'] = originalJhoData;
    }
    await rm(testHome, { recursive: true, force: true });
  });

  async function run(
    ...argv: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    const origStdout = process.stdout.write;
    const origStderr = process.stderr.write;
    const origExit = process.exit;

    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      return true;
    }) as typeof process.stderr.write;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`EXIT_${exitCode}`);
    }) as never;

    const parent = new Command('test-parent').addCommand(configCommand);
    try {
      await parent.parseAsync(['node', 'test-parent', 'config', ...argv]);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.startsWith('EXIT_')) {
        exitCode = parseInt(e.message.replace('EXIT_', ''), 10);
      } else {
        throw e;
      }
    } finally {
      process.stdout.write = origStdout;
      process.stderr.write = origStderr;
      process.exit = origExit;
    }

    return { stdout, stderr, exitCode };
  }

  it('show (default) outputs redacted JSON', async () => {
    const { stdout, exitCode } = await run('show');
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.llm.apiKey).toContain('***');
    expect(parsed.github.token).toContain('***');
  });

  it('show --reveal outputs raw JSON', async () => {
    const { stdout, exitCode } = await run('show', '--reveal');
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.llm.apiKey).toBe('secret-key');
    expect(parsed.github.token).toBe('ghp_secret');
  });

  it('show (default without explicit subcommand) outputs redacted JSON', async () => {
    const { stdout, exitCode } = await run();
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.llm.apiKey).toContain('***');
  });

  it('path outputs a path containing config.json', async () => {
    const { stdout, exitCode } = await run('path');
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toContain('config.json');
  });

  it('edit exits with code 1 (stub)', async () => {
    const { stderr, exitCode } = await run('edit');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
  });

  it('unknown subcommand exits with code 1', async () => {
    const { stderr, exitCode } = await run('bogus');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('unknown subcommand');
    expect(stderr).toContain('bogus');
  });
});
