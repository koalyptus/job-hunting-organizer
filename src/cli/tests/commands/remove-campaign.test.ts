import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { access, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache } from '../../../core/config.js';
import { runCommand } from '../helpers.js';
import { removeCampaignCommand } from '../../commands/remove-campaign.js';
import type * as ClackPrompts from '@clack/prompts';
import { confirm } from '@clack/prompts';

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

describe('remove-campaign command', () => {
  let testHome: string;
  let originalJhoConfigHome: string | undefined;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-rm-'));
    process.env['JHO_CONFIG_HOME'] = join(testHome, '.jho');
    process.env['JHO_DATA'] = join(testHome, 'data');
    clearConfigCache();
    mockedConfirm.mockResolvedValue(true);
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

    const campaignDir = join(testHome, 'data', 'campaigns', 'freelance');
    await mkdir(join(campaignDir, 'applied'), { recursive: true });
    await writeFile(
      join(campaignDir, 'config.json'),
      JSON.stringify({
        version: 1,
        profile: { path: '' },
        cv: { path: '' },
        applied: { dir: '' },
        knowledgeBase: { dir: '' },
      }),
    );
    await writeFile(join(campaignDir, 'profile.md'), '# Profile\n');
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
    return runCommand(removeCampaignCommand, ['remove-campaign', ...argv]);
  }

  it('removes a campaign with confirmation', async () => {
    const { stdout, exitCode } = await run('freelance');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('freelance');
    await expect(access(join(testHome, 'data', 'campaigns', 'freelance'))).rejects.toThrow();
  });

  it('removes a campaign without prompting when --yes is passed', async () => {
    const { exitCode } = await run('freelance', '--yes');
    expect(exitCode).toBe(0);
    expect(mockedConfirm).not.toHaveBeenCalled();
    await expect(access(join(testHome, 'data', 'campaigns', 'freelance'))).rejects.toThrow();
  });

  it('exits 0 and keeps data when the user cancels', async () => {
    mockedConfirm.mockResolvedValue(false);
    const { stdout, exitCode } = await run('freelance');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('cancelled');
    const statResult = await stat(join(testHome, 'data', 'campaigns', 'freelance'));
    expect(statResult.isDirectory()).toBe(true);
  });

  it('infers the campaign name from cwd but refuses while inside it', async () => {
    // cwd-inference resolves the name, but the self-foot-gun guard
    // correctly refuses to remove a campaign the user is standing in.
    const subDir = join(testHome, 'data', 'campaigns', 'freelance');
    const origCwd = process.cwd();
    process.chdir(subDir);
    try {
      const { stderr, exitCode } = await run();
      expect(exitCode).toBe(1);
      expect(stderr).toContain('refusing to remove');
    } finally {
      process.chdir(origCwd);
    }
  });

  it('refuses to remove the campaign cwd is inside of', async () => {
    const campaignDir = join(testHome, 'data', 'campaigns', 'freelance');
    const origCwd = process.cwd();
    process.chdir(campaignDir);
    try {
      const { stderr, exitCode } = await run('freelance', '--yes');
      expect(exitCode).toBe(1);
      expect(stderr).toContain('refusing to remove');
    } finally {
      process.chdir(origCwd);
    }
  });

  it('errors when the campaign does not exist', async () => {
    const { stderr, exitCode } = await run('nonexistent', '--yes');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not found');
  });

  it('rejects an invalid name', async () => {
    const { stderr, exitCode } = await run('../evil', '--yes');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('invalid');
  });

  it('errors when name cannot be inferred from cwd', async () => {
    const origCwd = process.cwd();
    process.chdir(testHome);
    try {
      const { stderr, exitCode } = await run();
      expect(exitCode).toBe(1);
      expect(stderr).toContain('could not infer');
    } finally {
      process.chdir(origCwd);
    }
  });

  it('honours the global --campaign flag when no positional name is given', async () => {
    // cwd is testHome (not inside any campaign); only --campaign selects it.
    const { exitCode } = await runCommand(
      removeCampaignCommand,
      ['--campaign', 'freelance', 'remove-campaign'],
      (parent) => parent.option('--campaign <name>', 'campaign name'),
    );
    expect(exitCode).toBe(0);
    await expect(access(join(testHome, 'data', 'campaigns', 'freelance'))).rejects.toThrow();
  });

  it('honours a global --yes flag placed before the subcommand', async () => {
    await runCommand(removeCampaignCommand, ['--yes', 'remove-campaign', 'freelance'], (parent) =>
      parent.option('-y, --yes', 'skip confirmation'),
    );
    expect(mockedConfirm).not.toHaveBeenCalled();
    await expect(access(join(testHome, 'data', 'campaigns', 'freelance'))).rejects.toThrow();
  });
});
