import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { clearConfigCache } from '../../../core/config.js';
import { runCommand } from '../helpers.js';
import { profileCommand } from '../../commands/profile.js';
import type * as ProfileModule from '../../../core/profile.js';
import { readProfile } from '../../../core/profile.js';

vi.mock('../../../core/profile.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ProfileModule>();
  return {
    ...actual,
    readProfile: vi.fn(actual.readProfile),
  };
});

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

  it('show outputs profile content when file exists', async () => {
    const profileContent = '# Profile — Test User\n\n## Contact\n\n- email@test.com\n';
    await writeFile(join(testHome, 'data', 'campaigns', 'default', 'profile.md'), profileContent);

    const { stdout, exitCode } = await runCommand(profileCommand, ['profile', 'show']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('# Profile — Test User');
    expect(stdout).toContain('email@test.com');
  });

  it('show throws when readProfile throws unexpected error', async () => {
    vi.mocked(readProfile).mockRejectedValueOnce(new Error('Disk failure'));

    await expect(runCommand(profileCommand, ['profile', 'show'])).rejects.toThrow('Disk failure');
  });

  it('show exits with code 1 when profile is missing', async () => {
    const { stderr, exitCode } = await runCommand(profileCommand, ['profile', 'show']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('no profile found');
    expect(stderr).toContain('jho init');
  });

  it('rebuild exits with code 1 (stub)', async () => {
    const { stderr, exitCode } = await runCommand(profileCommand, ['profile', 'rebuild']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 4c');
  });
});
