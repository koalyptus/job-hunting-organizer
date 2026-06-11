import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache } from '../../../core/config.js';
import { runCommand } from '../helpers.js';
import { initCommand } from '../../commands/init.js';

vi.mock('@clack/prompts', () => ({
  text: vi.fn(),
  select: vi.fn(),
  confirm: vi.fn(),
  password: vi.fn(),
  isCancel: vi.fn(() => false),
  log: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../../src/core/profile.js', () => ({
  buildProfile: vi.fn(() =>
    Promise.resolve({
      content:
        '# Profile — Test User\n\n## Target roles\n\n### senior-backend — Senior Backend [primary]\n\n- Level: Senior\n- Domain: Backend\n- Stack: TypeScript\n- Work style: Remote\n- Compensation: 150k\n- Notes: test\n',
      model: 'test-model',
      durationMs: 100,
    }),
  ),
}));

describe('init command', () => {
  let testHome: string;
  let originalJhoConfigHome: string | undefined;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-init-'));
    process.env['JHO_CONFIG_HOME'] = join(testHome, '.jho');
    process.env['JHO_DATA'] = join(testHome, 'data');
    clearConfigCache();

    // Set up global config directory
    await mkdir(join(testHome, '.jho'), { recursive: true });
  });

  afterEach(async () => {
    clearConfigCache();
    vi.clearAllMocks();
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
    return runCommand(initCommand, ['init', ...argv]);
  }

  it('creates campaign with skeleton profile when no CV or LLM provided', async () => {
    const { text, select, confirm, password } = await import('@clack/prompts');

    // Mock prompts: CV (empty), GitHub (empty), LLM base (empty), calendar (ics)
    vi.mocked(text)
      .mockResolvedValueOnce('') // CV path
      .mockResolvedValueOnce('') // GitHub user
      .mockResolvedValueOnce(''); // LLM base URL
    vi.mocked(select).mockResolvedValueOnce('ics'); // Calendar
    vi.mocked(confirm).mockResolvedValueOnce(false); // Re-init: no (first time)
    vi.mocked(password).mockResolvedValue('');

    const { exitCode } = await run();

    expect(exitCode).toBe(0);

    // Campaign dir created
    const campaignDir = join(testHome, 'data', 'campaigns', 'default');
    await stat(campaignDir);

    // Applied dir created
    await stat(join(campaignDir, 'applied'));

    // KB dirs created
    await stat(join(campaignDir, 'knowledge-base', 'local', 'cv'));
    await stat(join(campaignDir, 'knowledge-base', 'local', 'github'));

    // Skeleton profile written
    const profile = await readFile(join(campaignDir, 'profile.md'), 'utf8');
    expect(profile).toContain('# Profile — Candidate');
    expect(profile).toContain('## Target roles');
    expect(profile).toContain('<!-- jho:target-roles');

    // Global config written
    const globalConfig = JSON.parse(await readFile(join(testHome, '.jho', 'config.json'), 'utf8'));
    expect(globalConfig.calendar.defaultProvider).toBe('ics');

    // Campaign config written
    const campaignConfig = JSON.parse(await readFile(join(campaignDir, 'config.json'), 'utf8'));
    expect(campaignConfig.profile.path).toContain('profile.md');
  });

  it('creates named campaign', async () => {
    const { text, select, confirm, password } = await import('@clack/prompts');

    vi.mocked(text)
      .mockResolvedValueOnce('') // CV
      .mockResolvedValueOnce('') // GitHub
      .mockResolvedValueOnce(''); // LLM
    vi.mocked(select).mockResolvedValueOnce('none'); // Calendar
    vi.mocked(confirm).mockResolvedValueOnce(false);
    vi.mocked(password).mockResolvedValue('');

    const { exitCode } = await run('freelance');

    expect(exitCode).toBe(0);

    const campaignDir = join(testHome, 'data', 'campaigns', 'freelance');
    await stat(campaignDir);
  });

  it('rejects invalid campaign name', async () => {
    const { exitCode, stderr } = await run('../evil');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('invalid');
  });

  it('pre-fills GitHub username in skeleton profile', async () => {
    const { text, select, confirm, password } = await import('@clack/prompts');

    vi.mocked(text)
      .mockResolvedValueOnce('') // CV
      .mockResolvedValueOnce('testuser') // GitHub
      .mockResolvedValueOnce(''); // LLM
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(confirm).mockResolvedValueOnce(false);
    vi.mocked(password).mockResolvedValue('');

    await run();

    const profile = await readFile(
      join(testHome, 'data', 'campaigns', 'default', 'profile.md'),
      'utf8',
    );
    expect(profile).toContain('GitHub: testuser');
  });

  it('writes calendar none when selected', async () => {
    const { text, select, confirm, password } = await import('@clack/prompts');

    vi.mocked(text).mockResolvedValueOnce('').mockResolvedValueOnce('').mockResolvedValueOnce('');
    vi.mocked(select).mockResolvedValueOnce('none');
    vi.mocked(confirm).mockResolvedValueOnce(false);
    vi.mocked(password).mockResolvedValue('');

    await run();

    const globalConfig = JSON.parse(await readFile(join(testHome, '.jho', 'config.json'), 'utf8'));
    expect(globalConfig.calendar.defaultProvider).toBe('none');
  });

  it('prompts for confirmation on re-init', async () => {
    const { text, select, confirm, password } = await import('@clack/prompts');

    // Create existing campaign
    const campaignDir = join(testHome, 'data', 'campaigns', 'default');
    await mkdir(join(campaignDir, 'applied'), { recursive: true });

    vi.mocked(confirm).mockResolvedValueOnce(true); // Confirm overwrite
    vi.mocked(text).mockResolvedValueOnce('').mockResolvedValueOnce('').mockResolvedValueOnce('');
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    const { exitCode } = await run();
    expect(exitCode).toBe(0);
    expect(vi.mocked(confirm)).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('already exists') }),
    );
  });

  it('cancels on user decline at re-init', async () => {
    const { confirm } = await import('@clack/prompts');

    // Create existing campaign
    const campaignDir = join(testHome, 'data', 'campaigns', 'default');
    await mkdir(join(campaignDir, 'applied'), { recursive: true });

    vi.mocked(confirm).mockResolvedValueOnce(false);

    const { exitCode } = await run();
    expect(exitCode).toBe(0);
  });

  it('copies profile with --profile flag', async () => {
    const { text, select, confirm, password } = await import('@clack/prompts');
    const existingProfile = join(testHome, 'existing-profile.md');
    await writeFile(existingProfile, '# My Profile\n\n## Summary\n\nExperienced dev.\n');

    vi.mocked(confirm).mockResolvedValueOnce(false);
    vi.mocked(text).mockResolvedValueOnce('').mockResolvedValueOnce('').mockResolvedValueOnce('');
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    const { exitCode } = await run('--profile', existingProfile);

    expect(exitCode).toBe(0);

    const profile = await readFile(
      join(testHome, 'data', 'campaigns', 'default', 'profile.md'),
      'utf8',
    );
    expect(profile).toContain('Experienced dev.');
  });

  it('errors on missing --profile file', async () => {
    const { confirm, log } = await import('@clack/prompts');
    vi.mocked(confirm).mockResolvedValueOnce(false);

    const { exitCode } = await run('--profile', '/nonexistent/profile.md');
    expect(exitCode).toBe(1);
    expect(vi.mocked(log.error)).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });
});
