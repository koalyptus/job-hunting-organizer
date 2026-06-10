import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { clearConfigCache } from '../../../core/config.js';
import { profileCommand } from '../../commands/profile.js';

describe('profile command', () => {
  let testHome: string;
  let originalJhoConfigHome: string | undefined;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-prof-'));
    process.env['JHO_CONFIG_HOME'] = join(testHome, '.jho');
    process.env['JHO_DATA'] = join(testHome, 'data');
    clearConfigCache();

    await mkdir(join(testHome, '.jho'), { recursive: true });
    await writeFile(
      join(testHome, '.jho', 'config.json'),
      JSON.stringify({
        version: 1,
        dataRoot: join(testHome, 'data'),
        llm: { baseUrl: '', apiKey: '', model: '' },
        github: { user: '', token: '', repos: [] },
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
        profile: { path: join(testHome, 'data', 'campaigns', 'default', 'profile.md') },
        cv: { path: '' },
        applied: { dir: join(testHome, 'data', 'campaigns', 'default', 'applied') },
        knowledgeBase: { dir: '' },
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

    const parent = new Command('test-parent').addCommand(profileCommand);
    try {
      await parent.parseAsync(['node', 'test-parent', 'profile', ...argv]);
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

  it('show outputs profile content when file exists', async () => {
    const profileContent = '# Profile — Test User\n\n## Contact\n\n- email@test.com\n';
    await writeFile(join(testHome, 'data', 'campaigns', 'default', 'profile.md'), profileContent);

    const { stdout, exitCode } = await run('show');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('# Profile — Test User');
    expect(stdout).toContain('email@test.com');
  });

  it('show exits with code 1 when profile is missing', async () => {
    const { stderr, exitCode } = await run('show');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('no profile found');
    expect(stderr).toContain('jho init');
  });

  it('rebuild exits with code 1 (stub)', async () => {
    const { stderr, exitCode } = await run('rebuild');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 4c');
  });
});
