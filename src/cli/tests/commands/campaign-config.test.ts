import { Command } from 'commander';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { clearConfigCache } from '../../../core/config.js';
import { runCommand } from '../helpers.js';
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

  async function runWithCampaign(
    campaign: string,
    ...argv: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return runCommand(campaignConfigCommand, ['config', ...argv], (parent) => {
      parent.option('--campaign <name>', 'campaign name', campaign);
    });
  }

  it('show (default) outputs redacted campaign config', async () => {
    const { stdout, exitCode } = await runWithCampaign('default', 'show');
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('profile');
    expect(parsed).toHaveProperty('applied');
  });

  it('show --reveal outputs raw campaign config', async () => {
    const { stdout, exitCode } = await runWithCampaign('default', 'show', '--reveal');
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('profile');
  });

  it('show (default without explicit subcommand) outputs campaign config', async () => {
    const { stdout, exitCode } = await runWithCampaign('default');
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('profile');
  });

  it('path outputs a path containing config.json', async () => {
    const { stdout, exitCode } = await runWithCampaign('default', 'path');
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toContain('config.json');
  });

  it('edit exits with code 1 (stub)', async () => {
    const { stderr, exitCode } = await runWithCampaign('default', 'edit');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
  });

  it('unknown subcommand exits with code 1', async () => {
    const { stderr, exitCode } = await runWithCampaign('default', 'bogus');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('unknown subcommand');
    expect(stderr).toContain('bogus');
  });

  it('reads --campaign from grandparent opts', async () => {
    const program = new Command('root');
    program.option('--campaign <name>', 'campaign name');
    const campCmd = new Command('campaign');
    program.addCommand(campCmd);
    campCmd.addCommand(campaignConfigCommand);

    let stdout = '';
    let exitCode = 0;
    const origStdout = process.stdout.write;
    const origExit = process.exit;

    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      return true;
    }) as typeof process.stdout.write;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`EXIT_${exitCode}`);
    }) as never;

    try {
      await program.parseAsync([
        'node',
        'root',
        '--campaign',
        'default',
        'campaign',
        'config',
        'show',
      ]);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.startsWith('EXIT_')) {
        exitCode = parseInt(e.message.replace('EXIT_', ''), 10);
      } else {
        throw e;
      }
    } finally {
      process.stdout.write = origStdout;
      process.exit = origExit;
    }

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('profile');
  });
});
