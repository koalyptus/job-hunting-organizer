import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { clearConfigCache } from '../../../core/config/config.js';
import { runCommand } from '../helpers.js';
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

  it('show (default) outputs redacted JSON', async () => {
    const { stdout, exitCode } = await runCommand(configCommand, ['config', 'show']);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.llm.apiKey).toContain('***');
    expect(parsed.github.token).toContain('***');
  });

  it('show --reveal outputs raw JSON', async () => {
    const { stdout, exitCode } = await runCommand(configCommand, ['config', 'show', '--reveal']);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.llm.apiKey).toBe('secret-key');
    expect(parsed.github.token).toBe('ghp_secret');
  });

  it('show (default without explicit subcommand) outputs redacted JSON', async () => {
    const { stdout, exitCode } = await runCommand(configCommand, ['config']);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.llm.apiKey).toContain('***');
  });

  it('path outputs a path containing config.json', async () => {
    const { stdout, exitCode } = await runCommand(configCommand, ['config', 'path']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toContain('config.json');
  });

  it('edit exits with code 1 (stub)', async () => {
    const { stderr, exitCode } = await runCommand(configCommand, ['config', 'edit']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
  });

  it('unknown subcommand exits with code 1', async () => {
    const { stderr, exitCode } = await runCommand(configCommand, ['config', 'bogus']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('unknown subcommand');
    expect(stderr).toContain('bogus');
  });
});
