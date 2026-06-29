import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { text, select, confirm, password, isCancel } from '@clack/prompts';
import { clearConfigCache } from '../../../core/config.js';
import { runCommand } from '../helpers.js';
import { initCommand } from '../../commands/init.js';
import * as profileModule from '../../../core/profile.js';

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

vi.mock('../../../core/profile.js', () => ({
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
  let originalJhoCvPath: string | undefined;
  let originalJhoLinkedinUrl: string | undefined;

  beforeEach(async () => {
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoData = process.env['JHO_DATA'];
    originalJhoCvPath = process.env['JHO_CV_PATH'];
    originalJhoLinkedinUrl = process.env['JHO_LINKEDIN_URL'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-init-'));
    process.env['JHO_CONFIG_HOME'] = join(testHome, '.jho');
    process.env['JHO_DATA'] = join(testHome, 'data');
    clearConfigCache();

    // Set up global config directory
    await mkdir(join(testHome, '.jho'), { recursive: true });
  });

  afterEach(async () => {
    clearConfigCache();
    vi.restoreAllMocks();
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
    if (originalJhoCvPath === undefined) {
      delete process.env['JHO_CV_PATH'];
    } else {
      process.env['JHO_CV_PATH'] = originalJhoCvPath;
    }
    if (originalJhoLinkedinUrl === undefined) {
      delete process.env['JHO_LINKEDIN_URL'];
    } else {
      process.env['JHO_LINKEDIN_URL'] = originalJhoLinkedinUrl;
    }
    await rm(testHome, { recursive: true, force: true });
  });

  async function run(
    ...argv: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return runCommand(initCommand, ['init', ...argv]);
  }

  it('creates campaign with skeleton profile when no CV or LLM provided', async () => {
    // Mock prompts: LinkedIn (empty), CV (empty), GitHub (empty), LLM base (empty), calendar (ics)
    vi.mocked(text)
      .mockResolvedValueOnce('') // LinkedIn URL
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

    // KB dirs created
    await stat(join(campaignDir, 'knowledge-base', 'github'));

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
    vi.mocked(text)
      .mockResolvedValueOnce('') // LinkedIn
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
    vi.mocked(text)
      .mockResolvedValueOnce('') // LinkedIn
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
    vi.mocked(text)
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('');
    vi.mocked(select).mockResolvedValueOnce('none');
    vi.mocked(confirm).mockResolvedValueOnce(false);
    vi.mocked(password).mockResolvedValue('');

    await run();

    const globalConfig = JSON.parse(await readFile(join(testHome, '.jho', 'config.json'), 'utf8'));
    expect(globalConfig.calendar.defaultProvider).toBe('none');
  });

  it('prompts for confirmation on re-init', async () => {
    // Create existing campaign
    const campaignDir = join(testHome, 'data', 'campaigns', 'default');
    await mkdir(join(campaignDir, 'applied'), { recursive: true });

    vi.mocked(confirm).mockResolvedValueOnce(true); // Confirm overwrite
    vi.mocked(text)
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('');
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    const { exitCode } = await run();
    expect(exitCode).toBe(0);
    expect(vi.mocked(confirm)).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('already exists') }),
    );
  });

  it('shows CV prompt on re-init with existing CV path', async () => {
    const cvPath = join(testHome, 'my-cv.pdf');
    await writeFile(cvPath, 'fake cv');

    // Create existing campaign with config containing CV path
    const campaignDir = join(testHome, 'data', 'campaigns', 'default');
    await mkdir(campaignDir, { recursive: true });
    await writeFile(
      join(campaignDir, 'config.json'),
      JSON.stringify({
        version: 1,
        profile: { path: join(campaignDir, 'profile.md') },
        cv: { path: cvPath },
        linkedin: { url: '' },
        applied: { dir: join(campaignDir, 'applied') },
        knowledgeBase: { dir: join(campaignDir, 'knowledge-base') },
      }),
    );

    vi.mocked(confirm).mockResolvedValueOnce(true); // Confirm overwrite
    // LinkedIn prompt, then CV prompt should appear with initialValue set to existing CV path
    vi.mocked(text)
      .mockResolvedValueOnce('') // LinkedIn (skip)
      .mockResolvedValueOnce(cvPath) // CV (user confirms existing)
      .mockResolvedValueOnce('') // GitHub
      .mockResolvedValueOnce(''); // LLM
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    const { exitCode } = await run();
    expect(exitCode).toBe(0);

    // Verify CV prompt was called with initialValue
    expect(vi.mocked(text)).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('CV'),
        initialValue: cvPath,
      }),
    );
  });

  it('cancels on user decline at re-init', async () => {
    // Create existing campaign
    const campaignDir = join(testHome, 'data', 'campaigns', 'default');
    await mkdir(join(campaignDir, 'applied'), { recursive: true });

    vi.mocked(confirm).mockResolvedValueOnce(false);

    const { exitCode } = await run();
    expect(exitCode).toBe(0);
  });

  it('backs up existing profile on re-init', async () => {
    // Create existing campaign with a profile
    const campaignDir = join(testHome, 'data', 'campaigns', 'default');
    await mkdir(campaignDir, { recursive: true });
    const existingProfile = '# My Old Profile\n\n## Summary\n\nOld content.';
    await writeFile(join(campaignDir, 'profile.md'), existingProfile);

    vi.mocked(confirm).mockResolvedValueOnce(true); // Confirm overwrite
    vi.mocked(text)
      .mockResolvedValueOnce('') // LinkedIn
      .mockResolvedValueOnce('') // CV
      .mockResolvedValueOnce('') // GitHub
      .mockResolvedValueOnce(''); // LLM
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    const { exitCode } = await run();
    expect(exitCode).toBe(0);

    // Verify backup was created in backups/ folder
    const backupsDir = join(campaignDir, 'backups');
    await stat(backupsDir);
    const backups = await readdir(backupsDir);
    expect(backups.length).toBe(1);
    expect(backups[0]).toMatch(/^profile\.\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.md\.bak$/);

    // Verify backup content matches original
    const backupContent = await readFile(join(backupsDir, backups[0]!), 'utf8');
    expect(backupContent).toBe(existingProfile);
  });

  it('copies profile with --profile flag', async () => {
    const existingProfile = join(testHome, 'existing-profile.md');
    await writeFile(existingProfile, '# My Profile\n\n## Summary\n\nExperienced dev.\n');

    vi.mocked(confirm).mockResolvedValueOnce(false);
    vi.mocked(text)
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('');
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
    vi.mocked(confirm).mockResolvedValueOnce(false);

    const { exitCode, stderr } = await run('--profile', '/nonexistent/profile.md');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not found');
  });

  it('uses JHO_CV_PATH env var when set', async () => {
    const cvPath = join(testHome, 'my-cv.pdf');
    await writeFile(cvPath, 'fake cv');

    process.env['JHO_CV_PATH'] = cvPath;

    vi.mocked(confirm).mockResolvedValueOnce(false);
    vi.mocked(text).mockResolvedValueOnce('').mockResolvedValueOnce('').mockResolvedValueOnce(''); // LinkedIn, GitHub, LLM
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    const { exitCode } = await run();

    expect(exitCode).toBe(0);

    const campaignConfig = JSON.parse(
      await readFile(join(testHome, 'data', 'campaigns', 'default', 'config.json'), 'utf8'),
    );
    expect(campaignConfig.cv.path).toBe(cvPath);
  });

  it('saves CV path when profile build fails', async () => {
    let callCount = 0;
    vi.mocked(profileModule.buildProfile).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('LLM API error: 401'));
      }
      return Promise.resolve({
        content:
          '# Profile — Test User\n\n## Target roles\n\n### senior-backend — Senior Backend [primary]\n\n- Level: Senior\n- Domain: Backend\n- Stack: TypeScript\n- Work style: Remote\n- Compensation: 150k\n- Notes: test\n',
        model: 'test-model',
        durationMs: 100,
      });
    });

    const cvPath = join(testHome, 'my-cv.pdf');
    await writeFile(cvPath, 'fake cv');

    vi.mocked(confirm).mockResolvedValueOnce(false);
    vi.mocked(text)
      .mockResolvedValueOnce('') // LinkedIn (skip)
      .mockResolvedValueOnce(cvPath) // CV
      .mockResolvedValueOnce('') // GitHub
      .mockResolvedValueOnce('https://llm.example.com/v1') // LLM base URL
      .mockResolvedValueOnce('model-name'); // LLM model
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('test-key');

    // CLI catches InitError and writes to stderr with exit code 1
    const { exitCode, stderr } = await run();
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Profile build failed');
    expect(stderr).toContain('LLM API error: 401');

    // Campaign config should still have the CV path (written before profile build)
    const campaignConfig = JSON.parse(
      await readFile(join(testHome, 'data', 'campaigns', 'default', 'config.json'), 'utf8'),
    );
    expect(campaignConfig.cv.path).toBe(cvPath);
  });

  it('saves LinkedIn URL from prompt to campaign config', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(false);
    vi.mocked(text)
      .mockResolvedValueOnce('https://linkedin.com/in/testuser') // LinkedIn
      .mockResolvedValueOnce('') // CV
      .mockResolvedValueOnce('') // GitHub
      .mockResolvedValueOnce(''); // LLM
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    const { exitCode } = await run();

    expect(exitCode).toBe(0);

    const campaignConfig = JSON.parse(
      await readFile(join(testHome, 'data', 'campaigns', 'default', 'config.json'), 'utf8'),
    );
    expect(campaignConfig.linkedin.url).toBe('https://linkedin.com/in/testuser');
  });

  it('pre-fills LinkedIn URL in skeleton profile', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(false);
    vi.mocked(text)
      .mockResolvedValueOnce('https://linkedin.com/in/testuser') // LinkedIn
      .mockResolvedValueOnce('') // CV
      .mockResolvedValueOnce('') // GitHub
      .mockResolvedValueOnce(''); // LLM
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    await run();

    const profile = await readFile(
      join(testHome, 'data', 'campaigns', 'default', 'profile.md'),
      'utf8',
    );
    expect(profile).toContain('LinkedIn: https://linkedin.com/in/testuser');
  });

  it('uses --linkedin flag to skip prompt', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(false);
    vi.mocked(text)
      .mockResolvedValueOnce('') // CV
      .mockResolvedValueOnce('') // GitHub
      .mockResolvedValueOnce(''); // LLM
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    const { exitCode } = await run('--linkedin', 'https://linkedin.com/in/flaguser');

    expect(exitCode).toBe(0);

    const campaignConfig = JSON.parse(
      await readFile(join(testHome, 'data', 'campaigns', 'default', 'config.json'), 'utf8'),
    );
    expect(campaignConfig.linkedin.url).toBe('https://linkedin.com/in/flaguser');
  });

  it('uses JHO_LINKEDIN_URL env var when set', async () => {
    process.env['JHO_LINKEDIN_URL'] = 'https://linkedin.com/in/envuser';

    vi.mocked(confirm).mockResolvedValueOnce(false);
    vi.mocked(text)
      .mockResolvedValueOnce('') // CV
      .mockResolvedValueOnce('') // GitHub
      .mockResolvedValueOnce(''); // LLM
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    const { exitCode } = await run();

    expect(exitCode).toBe(0);

    const campaignConfig = JSON.parse(
      await readFile(join(testHome, 'data', 'campaigns', 'default', 'config.json'), 'utf8'),
    );
    expect(campaignConfig.linkedin.url).toBe('https://linkedin.com/in/envuser');
  });

  it('trims whitespace from LinkedIn URL prompt', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(false);
    vi.mocked(text)
      .mockResolvedValueOnce('  https://linkedin.com/in/testuser  ') // LinkedIn with whitespace
      .mockResolvedValueOnce('') // CV
      .mockResolvedValueOnce('') // GitHub
      .mockResolvedValueOnce(''); // LLM
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    await run();

    const campaignConfig = JSON.parse(
      await readFile(join(testHome, 'data', 'campaigns', 'default', 'config.json'), 'utf8'),
    );
    expect(campaignConfig.linkedin.url).toBe('https://linkedin.com/in/testuser');
  });

  it('trims whitespace from --linkedin flag', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(false);
    vi.mocked(text)
      .mockResolvedValueOnce('') // CV
      .mockResolvedValueOnce('') // GitHub
      .mockResolvedValueOnce(''); // LLM
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    await run('--linkedin', '  https://linkedin.com/in/flaguser  ');

    const campaignConfig = JSON.parse(
      await readFile(join(testHome, 'data', 'campaigns', 'default', 'config.json'), 'utf8'),
    );
    expect(campaignConfig.linkedin.url).toBe('https://linkedin.com/in/flaguser');
  });

  it('trims whitespace from JHO_LINKEDIN_URL env var', async () => {
    process.env['JHO_LINKEDIN_URL'] = '  https://linkedin.com/in/envuser  ';

    vi.mocked(confirm).mockResolvedValueOnce(false);
    vi.mocked(text)
      .mockResolvedValueOnce('') // CV
      .mockResolvedValueOnce('') // GitHub
      .mockResolvedValueOnce(''); // LLM
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    await run();

    const campaignConfig = JSON.parse(
      await readFile(join(testHome, 'data', 'campaigns', 'default', 'config.json'), 'utf8'),
    );
    expect(campaignConfig.linkedin.url).toBe('https://linkedin.com/in/envuser');
  });

  it('trims whitespace from CV path prompt', async () => {
    const cvPath = join(testHome, 'my-cv.pdf');
    await writeFile(cvPath, 'fake cv');

    vi.mocked(confirm).mockResolvedValueOnce(false);
    vi.mocked(text)
      .mockResolvedValueOnce('') // LinkedIn
      .mockResolvedValueOnce(`  ${cvPath}  `) // CV with whitespace
      .mockResolvedValueOnce('') // GitHub
      .mockResolvedValueOnce(''); // LLM
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    await run();

    const campaignConfig = JSON.parse(
      await readFile(join(testHome, 'data', 'campaigns', 'default', 'config.json'), 'utf8'),
    );
    expect(campaignConfig.cv.path).toBe(cvPath);
  });

  it('re-inits without prompt in --yes mode when campaign exists', async () => {
    const campaignDir = join(testHome, 'data', 'campaigns', 'default');
    await mkdir(join(campaignDir, 'applied'), { recursive: true });

    vi.mocked(text)
      .mockResolvedValueOnce('') // LinkedIn
      .mockResolvedValueOnce('') // CV
      .mockResolvedValueOnce('') // GitHub
      .mockResolvedValueOnce(''); // LLM
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    const { exitCode } = await run('--yes');
    expect(exitCode).toBe(0);

    expect(confirm).not.toHaveBeenCalled();
  });

  it('uses existing LinkedIn URL from campaign config', async () => {
    const campaignDir = join(testHome, 'data', 'campaigns', 'default');
    await mkdir(campaignDir, { recursive: true });
    await writeFile(
      join(campaignDir, 'config.json'),
      JSON.stringify({
        version: 1,
        profile: { path: join(campaignDir, 'profile.md') },
        cv: { path: '' },
        linkedin: { url: 'https://linkedin.com/in/existing' },
        applied: { dir: join(campaignDir, 'applied') },
        knowledgeBase: { dir: join(campaignDir, 'knowledge-base') },
      }),
    );

    vi.mocked(confirm).mockResolvedValueOnce(true); // Confirm overwrite
    vi.mocked(text)
      .mockResolvedValueOnce('https://linkedin.com/in/existing') // LinkedIn (accept existing)
      .mockResolvedValueOnce('') // CV
      .mockResolvedValueOnce('') // GitHub
      .mockResolvedValueOnce(''); // LLM
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    const { exitCode } = await run();
    expect(exitCode).toBe(0);

    const campaignConfig = JSON.parse(await readFile(join(campaignDir, 'config.json'), 'utf8'));
    expect(campaignConfig.linkedin.url).toBe('https://linkedin.com/in/existing');
  });

  it('uses existing CV path from campaign config', async () => {
    const cvPath = join(testHome, 'existing-cv.pdf');
    await writeFile(cvPath, 'fake cv');

    const campaignDir = join(testHome, 'data', 'campaigns', 'default');
    await mkdir(campaignDir, { recursive: true });
    await writeFile(
      join(campaignDir, 'config.json'),
      JSON.stringify({
        version: 1,
        profile: { path: join(campaignDir, 'profile.md') },
        cv: { path: cvPath },
        linkedin: { url: '' },
        applied: { dir: join(campaignDir, 'applied') },
        knowledgeBase: { dir: join(campaignDir, 'knowledge-base') },
      }),
    );

    vi.mocked(confirm).mockResolvedValueOnce(true); // Confirm overwrite
    vi.mocked(text)
      .mockResolvedValueOnce('') // LinkedIn
      .mockResolvedValueOnce(cvPath) // CV (accept existing)
      .mockResolvedValueOnce('') // GitHub
      .mockResolvedValueOnce(''); // LLM
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    const { exitCode } = await run();
    expect(exitCode).toBe(0);

    const campaignConfig = JSON.parse(await readFile(join(campaignDir, 'config.json'), 'utf8'));
    expect(campaignConfig.cv.path).toBe(cvPath);
  });

  it('skips invalid CV in --yes mode', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(false);
    vi.mocked(text)
      .mockResolvedValueOnce('') // LinkedIn
      .mockResolvedValueOnce('/nonexistent/cv.pdf') // CV (invalid)
      .mockResolvedValueOnce('') // GitHub
      .mockResolvedValueOnce(''); // LLM
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    const { exitCode } = await run('--yes');
    expect(exitCode).toBe(0);

    const campaignConfig = JSON.parse(
      await readFile(join(testHome, 'data', 'campaigns', 'default', 'config.json'), 'utf8'),
    );
    expect(campaignConfig.cv.path).toBe('');
  });

  it('prompts for retry on invalid CV path', async () => {
    const validCv = join(testHome, 'valid-cv.pdf');
    await writeFile(validCv, 'fake cv');

    vi.mocked(confirm).mockResolvedValueOnce(false);
    vi.mocked(text)
      .mockResolvedValueOnce('') // LinkedIn
      .mockResolvedValueOnce('/nonexistent/cv.pdf') // CV (invalid)
      .mockResolvedValueOnce(validCv) // CV retry (valid)
      .mockResolvedValueOnce('') // GitHub
      .mockResolvedValueOnce(''); // LLM
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    const { exitCode } = await run();
    expect(exitCode).toBe(0);

    const campaignConfig = JSON.parse(
      await readFile(join(testHome, 'data', 'campaigns', 'default', 'config.json'), 'utf8'),
    );
    expect(campaignConfig.cv.path).toBe(validCv);
  });

  it('skips CV on retry cancel', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(false);
    vi.mocked(text)
      .mockResolvedValueOnce('') // LinkedIn
      .mockResolvedValueOnce('/nonexistent/cv.pdf') // CV (invalid)
      .mockResolvedValueOnce('') // CV retry (empty = skip)
      .mockResolvedValueOnce('') // GitHub
      .mockResolvedValueOnce(''); // LLM
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    const { exitCode } = await run();
    expect(exitCode).toBe(0);

    const campaignConfig = JSON.parse(
      await readFile(join(testHome, 'data', 'campaigns', 'default', 'config.json'), 'utf8'),
    );
    expect(campaignConfig.cv.path).toBe('');
  });

  it('uses existing CV path in --yes mode from campaign config', async () => {
    const cvPath = join(testHome, 'existing-cv.pdf');
    await writeFile(cvPath, 'fake cv');

    const campaignDir = join(testHome, 'data', 'campaigns', 'default');
    await mkdir(campaignDir, { recursive: true });
    await writeFile(
      join(campaignDir, 'config.json'),
      JSON.stringify({
        version: 1,
        profile: { path: join(campaignDir, 'profile.md') },
        cv: { path: cvPath },
        linkedin: { url: '' },
        applied: { dir: join(campaignDir, 'applied') },
        knowledgeBase: { dir: join(campaignDir, 'knowledge-base') },
      }),
    );

    vi.mocked(confirm).mockResolvedValueOnce(true); // Confirm overwrite
    vi.mocked(text)
      .mockResolvedValueOnce('') // GitHub
      .mockResolvedValueOnce(''); // LLM
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    const { exitCode } = await run('--yes');
    expect(exitCode).toBe(0);

    const campaignConfig = JSON.parse(await readFile(join(campaignDir, 'config.json'), 'utf8'));
    expect(campaignConfig.cv.path).toBe(cvPath);
  });

  it('cancels on LinkedIn prompt cancel', async () => {
    vi.mocked(isCancel).mockReturnValueOnce(true);

    const { exitCode } = await run();
    expect(exitCode).toBe(0);
  });

  it('skips invalid CV in --yes mode from --cv flag', async () => {
    vi.mocked(text)
      .mockResolvedValueOnce('') // GitHub
      .mockResolvedValueOnce(''); // LLM
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    const { exitCode } = await run('--yes', '--cv', '/nonexistent/cv.pdf');
    expect(exitCode).toBe(0);

    const campaignConfig = JSON.parse(
      await readFile(join(testHome, 'data', 'campaigns', 'default', 'config.json'), 'utf8'),
    );
    expect(campaignConfig.cv.path).toBe('');
  });

  it('uses existing LinkedIn URL in --yes mode from campaign config', async () => {
    const campaignDir = join(testHome, 'data', 'campaigns', 'default');
    await mkdir(campaignDir, { recursive: true });
    await writeFile(
      join(campaignDir, 'config.json'),
      JSON.stringify({
        version: 1,
        profile: { path: join(campaignDir, 'profile.md') },
        cv: { path: '' },
        linkedin: { url: 'https://linkedin.com/in/existing' },
        applied: { dir: join(campaignDir, 'applied') },
        knowledgeBase: { dir: join(campaignDir, 'knowledge-base') },
      }),
    );

    vi.mocked(confirm).mockResolvedValueOnce(true); // Confirm overwrite
    vi.mocked(text)
      .mockResolvedValueOnce('') // GitHub
      .mockResolvedValueOnce(''); // LLM
    vi.mocked(select).mockResolvedValueOnce('ics');
    vi.mocked(password).mockResolvedValue('');

    const { exitCode } = await run('--yes');
    expect(exitCode).toBe(0);

    const campaignConfig = JSON.parse(await readFile(join(campaignDir, 'config.json'), 'utf8'));
    expect(campaignConfig.linkedin.url).toBe('https://linkedin.com/in/existing');
  });

  it('cancels on CV prompt cancel', async () => {
    vi.mocked(text)
      .mockResolvedValueOnce('') // LinkedIn (empty)
      .mockResolvedValueOnce('/some/path.pdf'); // CV
    vi.mocked(isCancel)
      .mockReturnValueOnce(false) // LinkedIn
      .mockReturnValueOnce(true); // CV

    const { exitCode } = await run();
    expect(exitCode).toBe(0);
  });
});
