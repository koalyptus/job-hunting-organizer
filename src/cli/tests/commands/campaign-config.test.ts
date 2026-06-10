import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { clearConfigCache } from '../../../core/config.js';
import { campaignConfigCommand } from '../../commands/campaign-config.js';

describe('campaign config command', () => {
  let testHome: string;
  let originalJhoConfigHome: string | undefined;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-campcfg-'));
    process.env['JHO_CONFIG_HOME'] = join(testHome, '.jho');
    process.env['JHO_DATA'] = join(testHome, 'data');
    clearConfigCache();

    await mkdir(join(testHome, '.jho'), { recursive: true });
    await writeFile(
      join(testHome, '.jho', 'config.json'),
      JSON.stringify({
        version: 1,
        dataRoot: join(testHome, 'data'),
        llm: { baseUrl: '', apiKey: 'secret-key', model: '' },
        github: { user: '', token: 'ghp_secret', repos: [] },
        calendar: {
          defaultProvider: 'ics',
          outlook: { tenantId: '', clientId: '', clientSecret: '' },
        },
        logging: { level: 'info', file: '', redactPaths: [] },
      }),
    );

    await mkdir(join(testHome, 'data', 'campaigns', 'default'), { recursive: true });
    await writeFile(
      join(testHome, 'data', 'campaigns', 'default', 'config.json'),
      JSON.stringify({
        version: 1,
        profile: { path: '/tmp/profile.md' },
        cv: { path: '/tmp/cv.pdf' },
        applied: { dir: '/tmp/applied' },
        knowledgeBase: { dir: '/tmp/kb' },
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
    campaign: string,
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

    const parent = new Command('test-parent')
      .option('--campaign <name>', 'campaign name', campaign)
      .addCommand(campaignConfigCommand);
    try {
      await parent.parseAsync(['node', 'test-parent', '--campaign', campaign, 'config', ...argv]);
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

  it('show (default) outputs redacted campaign config', async () => {
    const { stdout, exitCode } = await run('default', 'show');
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('profile');
    expect(parsed).toHaveProperty('applied');
  });

  it('show --reveal outputs raw campaign config', async () => {
    const { stdout, exitCode } = await run('default', 'show', '--reveal');
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('profile');
  });

  it('show (default without explicit subcommand) outputs campaign config', async () => {
    const { stdout, exitCode } = await run('default');
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('profile');
  });

  it('path outputs a path containing config.json', async () => {
    const { stdout, exitCode } = await run('default', 'path');
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toContain('config.json');
  });

  it('edit exits with code 1 (stub)', async () => {
    const { stderr, exitCode } = await run('default', 'edit');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
  });

  it('unknown subcommand exits with code 1', async () => {
    const { stderr, exitCode } = await run('default', 'bogus');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('unknown subcommand');
    expect(stderr).toContain('bogus');
  });
});
