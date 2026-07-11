import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearConfigCache } from '../../../core/config/config.js';
import { runCommand } from '../helpers.js';
import { renameCampaignCommand } from '../../commands/rename-campaign.js';

describe('rename-campaign command', () => {
  let testHome: string;
  let originalJhoConfigHome: string | undefined;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-rename-'));
    process.env['JHO_CONFIG_HOME'] = join(testHome, '.jho');
    process.env['JHO_DATA'] = join(testHome, 'data');
    clearConfigCache();

    // Set up global config
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

    // Create a campaign to rename
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
    return runCommand(renameCampaignCommand, ['rename-campaign', ...argv]);
  }

  it('renames a campaign successfully', async () => {
    const { stdout, exitCode } = await run('personal', '--from', 'freelance');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('freelance');
    expect(stdout).toContain('personal');

    const configStat = await stat(join(testHome, 'data', 'campaigns', 'personal', 'config.json'));
    expect(configStat.isFile()).toBe(true);
  });

  it('preserves campaign contents after rename', async () => {
    await run('personal', '--from', 'freelance');
    const content = await readFile(
      join(testHome, 'data', 'campaigns', 'personal', 'profile.md'),
      'utf8',
    );
    expect(content).toContain('# Profile');
  });

  it('old campaign no longer exists after rename', async () => {
    await run('personal', '--from', 'freelance');
    await expect(access(join(testHome, 'data', 'campaigns', 'freelance'))).rejects.toThrow();
  });

  it('infers old name from cwd and rejects self-rename', async () => {
    // cwd inference works but the self-foot-gun check correctly
    // prevents renaming a campaign from inside it.
    const subDir = join(testHome, 'data', 'campaigns', 'freelance', 'applied');
    const origCwd = process.cwd();
    process.chdir(subDir);

    try {
      const { stderr, exitCode } = await run('personal');
      expect(exitCode).toBe(1);
      expect(stderr).toContain('refusing to rename');
    } finally {
      process.chdir(origCwd);
    }
  });

  it('rejects empty new name', async () => {
    const { stderr, exitCode } = await run('', '--from', 'freelance');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('invalid');
  });

  it('rejects name with slashes', async () => {
    const { stderr, exitCode } = await run('../evil', '--from', 'freelance');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('invalid');
  });

  it('rejects name starting with dash', async () => {
    // Commander interprets "-freelance" as an option flag, so this is
    // rejected at the parse level before our validation runs. The
    // end result is the same: exit 1, error on stderr.
    const { stderr, exitCode } = await run('-freelance', '--from', 'other');
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/invalid|unknown option/);
  });

  it('rejects name with whitespace', async () => {
    const { stderr, exitCode } = await run('foo bar', '--from', 'freelance');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('invalid');
  });

  it('refuses to rename campaign cwd is inside of', async () => {
    const campaignDir = join(testHome, 'data', 'campaigns', 'freelance');
    const origCwd = process.cwd();
    process.chdir(campaignDir);

    try {
      const { stderr, exitCode } = await run('personal', '--from', 'freelance');
      expect(exitCode).toBe(1);
      expect(stderr).toContain('refusing to rename');
    } finally {
      process.chdir(origCwd);
    }
  });

  it('errors when old campaign does not exist', async () => {
    const { stderr, exitCode } = await run('newname', '--from', 'nonexistent');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not found');
  });

  it('errors when new campaign name already exists', async () => {
    await mkdir(join(testHome, 'data', 'campaigns', 'existing'), { recursive: true });

    const { stderr, exitCode } = await run('existing', '--from', 'freelance');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('already exists');
  });

  it('errors when old name cannot be inferred from cwd', async () => {
    const origCwd = process.cwd();
    process.chdir(testHome);

    try {
      const { stderr, exitCode } = await run('personal');
      expect(exitCode).toBe(1);
      expect(stderr).toContain('could not infer');
    } finally {
      process.chdir(origCwd);
    }
  });
});
