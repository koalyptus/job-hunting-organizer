import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { log as clackLog } from '@clack/prompts';
import { runLockedInitSteps, printInitSummary } from '../../../workflow/init/init-write.js';
import { clearConfigCache } from '../../config/config.js';
import { JHO_CONFIG_HOME, JHO_DATA } from '../../../workflow/init/constants.js';
import { childLogger } from '../../logger/logger.js';

vi.mock('@clack/prompts', () => ({
  log: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../campaign/profile-builder.js', () => ({
  handleProfile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../campaign/kb-ingest.js', () => ({
  ingestKnowledgeBase: vi.fn().mockResolvedValue(['doc.md']),
}));

describe('runLockedInitSteps', () => {
  let testHome: string;
  let originalJhoConfigHome: string | undefined;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalJhoConfigHome = process.env[JHO_CONFIG_HOME];
    originalJhoData = process.env[JHO_DATA];
    testHome = await mkdtemp(join(tmpdir(), 'jho-init-write-test-'));
    process.env[JHO_CONFIG_HOME] = join(testHome, '.jho');
    process.env[JHO_DATA] = join(testHome, 'data');
    clearConfigCache();

    // Set up global config directory
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(testHome, '.jho'), { recursive: true });
  });

  afterEach(async () => {
    clearConfigCache();
    if (originalJhoConfigHome === undefined) {
      delete process.env[JHO_CONFIG_HOME];
    } else {
      process.env[JHO_CONFIG_HOME] = originalJhoConfigHome;
    }
    if (originalJhoData === undefined) {
      delete process.env[JHO_DATA];
    } else {
      process.env[JHO_DATA] = originalJhoData;
    }
    await rm(testHome, { recursive: true, force: true });
  });

  it('creates directories and writes configs on happy path', async () => {
    const campaignRoot = join(testHome, 'data', 'campaigns', 'test-campaign');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(campaignRoot, { recursive: true });

    const log = childLogger({ cmd: 'init' });

    await runLockedInitSteps({
      campaignRoot,
      name: 'test-campaign',
      dataRoot: join(testHome, 'data'),
      kbPath: undefined,
      cvPath: undefined,
      linkedinUrl: undefined,
      github: { user: 'testuser', token: 'gh-token' },
      llm: { baseUrl: 'http://localhost:11434/v1', model: 'llama3' },
      llmConfig: {
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '***',
        model: 'llama3',
        timeoutMs: 1200000,
      },
      profileFlag: undefined,
      nonInteractive: true,
      log,
    });

    // Verify directory structure was created
    const dirs = await readdir(campaignRoot);
    expect(dirs).toContain('knowledge-base');

    // Verify voice guide was scaffolded
    const voiceGuidePath = join(campaignRoot, 'knowledge-base', 'my-voice.md');
    const voiceGuide = await readFile(voiceGuidePath, 'utf8');
    expect(voiceGuide).toContain('My Voice');
  });

  it('skips KB ingest when no kbPath provided', async () => {
    const campaignRoot = join(testHome, 'data', 'campaigns', 'test-campaign');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(campaignRoot, { recursive: true });

    const log = childLogger({ cmd: 'init' });

    await runLockedInitSteps({
      campaignRoot,
      name: 'test-campaign',
      dataRoot: join(testHome, 'data'),
      kbPath: undefined,
      cvPath: undefined,
      linkedinUrl: undefined,
      github: {},
      llm: {},
      nonInteractive: true,
      log,
    });

    // KB ingest should not have been called with a path
    const { ingestKnowledgeBase } = await import('../../campaign/kb-ingest.js');
    expect(ingestKnowledgeBase).not.toHaveBeenCalled();
  });

  it('backs up existing profile on re-init', async () => {
    const campaignRoot = join(testHome, 'data', 'campaigns', 'test-campaign');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(campaignRoot, { recursive: true });

    // Create an existing profile
    const profilePath = join(campaignRoot, 'profile.md');
    await writeFile(profilePath, '# Old Profile', 'utf8');

    const log = childLogger({ cmd: 'init' });

    await runLockedInitSteps({
      campaignRoot,
      name: 'test-campaign',
      dataRoot: join(testHome, 'data'),
      kbPath: undefined,
      cvPath: undefined,
      linkedinUrl: undefined,
      github: {},
      llm: {},
      nonInteractive: true,
      log,
    });

    // Verify backup was created
    const backupsDir = join(campaignRoot, 'backups');
    const backups = await readdir(backupsDir);
    expect(backups.length).toBe(1);
    expect(backups[0]).toMatch(/^profile\..*\.md\.bak$/);
  });

  it('does not create backup when no existing profile', async () => {
    const campaignRoot = join(testHome, 'data', 'campaigns', 'test-campaign');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(campaignRoot, { recursive: true });

    const log = childLogger({ cmd: 'init' });

    await runLockedInitSteps({
      campaignRoot,
      name: 'test-campaign',
      dataRoot: join(testHome, 'data'),
      kbPath: undefined,
      cvPath: undefined,
      linkedinUrl: undefined,
      github: {},
      llm: {},
      nonInteractive: true,
      log,
    });

    // No backups dir should exist
    const backupsDir = join(campaignRoot, 'backups');
    const { pathExists } = await import('../../fs.js');
    expect(await pathExists(backupsDir)).toBe(false);
  });
});

describe('printInitSummary', () => {
  it('prints summary with all fields set', () => {
    printInitSummary(
      'my-campaign',
      {
        profilePath: '/path/to/profile.md',
        linkedinUrl: 'https://linkedin.com/in/test',
        cvPath: '/path/to/cv.pdf',
        githubUser: 'testuser',
        hasLlm: true,
        baseUrl: 'http://localhost:11434/v1',
        model: 'llama3',
      },
      '/path/to/knowledge-base/my-voice.md',
    );

    expect(clackLog.success).toHaveBeenCalledWith('Campaign "my-campaign" created');
    expect(clackLog.info).toHaveBeenCalledWith(
      expect.stringContaining('Profile: /path/to/profile.md'),
    );
    expect(clackLog.info).toHaveBeenCalledWith(
      expect.stringContaining('LinkedIn: https://linkedin.com/in/test'),
    );
    expect(clackLog.info).toHaveBeenCalledWith(expect.stringContaining('CV: /path/to/cv.pdf'));
    expect(clackLog.info).toHaveBeenCalledWith(expect.stringContaining('GitHub: testuser'));
    expect(clackLog.info).toHaveBeenCalledWith(
      expect.stringContaining('LLM: http://localhost:11434/v1 (llama3)'),
    );
    expect(clackLog.info).toHaveBeenCalledWith(
      expect.stringContaining('edit /path/to/knowledge-base/my-voice.md'),
    );
  });

  it('prints summary with optional fields unset', () => {
    printInitSummary('my-campaign', {
      profilePath: '/path/to/profile.md',
      linkedinUrl: undefined,
      cvPath: undefined,
      githubUser: undefined,
      hasLlm: false,
      baseUrl: undefined,
      model: undefined,
    });

    expect(clackLog.success).toHaveBeenCalledWith('Campaign "my-campaign" created');
    expect(clackLog.info).toHaveBeenCalledWith(expect.stringContaining('LinkedIn: (not set)'));
    expect(clackLog.info).toHaveBeenCalledWith(expect.stringContaining('CV: (not set)'));
    expect(clackLog.info).toHaveBeenCalledWith(expect.stringContaining('GitHub: (not set)'));
    expect(clackLog.info).toHaveBeenCalledWith(expect.stringContaining('LLM: (not configured)'));
  });
});
