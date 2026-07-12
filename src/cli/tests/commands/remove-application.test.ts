import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { access, mkdir, mkdtemp, rm, stat, writeFile, readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache } from '../../../core/config/config.js';
import { runCommand } from '../helpers.js';
import { removeApplicationCommand } from '../../commands/remove-application.js';
import type * as ClackPrompts from '@clack/prompts';
import { confirm } from '@clack/prompts';

const SLUG = '2026-Jan-15-frontend-acme-12345';

vi.mock('@clack/prompts', async (importOriginal) => {
  const actual = await importOriginal<typeof ClackPrompts>();
  return {
    ...actual,
    confirm: vi.fn(),
    isCancel: actual.isCancel,
    log: actual.log,
  };
});

const mockedConfirm = vi.mocked(confirm);

describe('remove-application command', () => {
  let testHome: string;
  let originalJhoConfigHome: string | undefined;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-rm-app-'));
    process.env['JHO_CONFIG_HOME'] = join(testHome, '.jho');
    process.env['JHO_DATA'] = join(testHome, 'data');
    clearConfigCache();
    vi.clearAllMocks();
    mockedConfirm.mockResolvedValue(true);

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

    // Create a campaign with one application.
    const appliedDir = join(testHome, 'data', 'campaigns', 'default', 'applied');
    await mkdir(join(appliedDir, SLUG), { recursive: true });
    await writeFile(join(appliedDir, SLUG, 'meta.md'), '# App\n');
    await writeFile(
      join(appliedDir, '.index.json'),
      JSON.stringify([{ slug: SLUG }], null, 2) + '\n',
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
    if (testHome) {
      await rm(testHome, { recursive: true, force: true });
    }
  });

  async function run(
    ...argv: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return runCommand(removeApplicationCommand, ['remove-application', ...argv]);
  }

  it('removes an application with confirmation', async () => {
    const { stdout, exitCode } = await run(SLUG);
    expect(exitCode).toBe(0);
    expect(stdout).toContain(SLUG);
    await expect(
      access(join(testHome, 'data', 'campaigns', 'default', 'applied', SLUG)),
    ).rejects.toThrow();
  });

  it('removes an application without prompting when --yes is passed', async () => {
    const { exitCode } = await run(SLUG, '--yes');
    expect(exitCode).toBe(0);
    expect(mockedConfirm).not.toHaveBeenCalled();
    await expect(
      access(join(testHome, 'data', 'campaigns', 'default', 'applied', SLUG)),
    ).rejects.toThrow();
  });

  it('honours a global --yes flag placed before the subcommand', async () => {
    await runCommand(removeApplicationCommand, ['--yes', 'remove-application', SLUG], (parent) =>
      parent.option('-y, --yes', 'skip confirmation'),
    );
    expect(mockedConfirm).not.toHaveBeenCalled();
    await expect(
      access(join(testHome, 'data', 'campaigns', 'default', 'applied', SLUG)),
    ).rejects.toThrow();
  });

  it('exits 0 and keeps data when the user cancels', async () => {
    mockedConfirm.mockResolvedValue(false);
    const { stdout, exitCode } = await run(SLUG);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('declined');
    const statResult = await stat(join(testHome, 'data', 'campaigns', 'default', 'applied', SLUG));
    expect(statResult.isDirectory()).toBe(true);
  });

  it('infers the slug from cwd', async () => {
    const appDir = join(testHome, 'data', 'campaigns', 'default', 'applied', SLUG);
    const origCwd = process.cwd();
    process.chdir(appDir);
    try {
      // Decline the prompt so we never delete the process working
      // directory — removing the cwd fails with EBUSY on Windows. This
      // still exercises cwd inference: a missing slug would error with
      // "missing" before the confirmation prompt, and the resolved slug
      // is echoed in the prompt message.
      mockedConfirm.mockResolvedValue(false);
      const { stdout, exitCode } = await run();
      expect(exitCode).toBe(0);
      expect(stdout).toContain('declined');
      expect(stdout).not.toContain('missing');
      expect(mockedConfirm).toHaveBeenCalledTimes(1);
      expect(mockedConfirm.mock.calls[0]![0]!.message).toContain(SLUG);

      // Folder remains because we declined.
      const statResult = await stat(appDir);
      expect(statResult.isDirectory()).toBe(true);
    } finally {
      process.chdir(origCwd);
    }
  });

  it('errors when the application does not exist', async () => {
    const { stderr, exitCode } = await run('2026-Jan-99-nonexistent-99999', '--yes');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not found');
  });

  it('errors when no slug can be resolved', async () => {
    const { stderr, exitCode } = await run('--yes');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('missing');
  });

  it('removes the index entry for the application', async () => {
    await run(SLUG, '--yes');
    const index = await readFile(
      join(testHome, 'data', 'campaigns', 'default', 'applied', '.index.json'),
      'utf8',
    );
    expect(JSON.parse(index)).toEqual([]);
  });
});
