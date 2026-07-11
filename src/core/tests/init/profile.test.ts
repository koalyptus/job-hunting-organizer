import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { select } from '@clack/prompts';
import { buildProfile } from '../../profile.js';
import { handleProfile } from '../../profile-builder.js';
import type * as FsModule from '../../fs.js';
import { atomicWrite } from '../../fs.js';
import { parseTargetRoles } from '../../target-roles.js';

vi.mock('@clack/prompts', () => ({
  text: vi.fn(),
  select: vi.fn(),
  isCancel: vi.fn(() => false),
  log: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../profile.js', () => ({
  buildProfile: vi.fn(() =>
    Promise.resolve({
      content:
        '# Profile — Test User\n\n## Target roles\n\n### senior-backend — Senior Backend [primary]\n\n- Level: Senior',
      model: 'test-model',
      durationMs: 100,
    }),
  ),
}));

vi.mock('../../target-roles.js', () => ({
  parseTargetRoles: vi.fn(() => []),
  replaceTargetRoles: vi.fn((content: string) => content),
}));

vi.mock('../../spinner.js', () => ({
  withSpinner: vi.fn((_msg: string, _success: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../../fs.js', async (importOriginal) => {
  const actual = await importOriginal<typeof FsModule>();
  return {
    ...actual,
    atomicWrite: vi.fn().mockResolvedValue(true),
  };
});

describe('handleProfile', () => {
  let testDir: string;
  let campaignRoot: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'jho-profile-test-'));
    campaignRoot = join(testDir, 'campaigns', 'test');
    await mkdir(join(campaignRoot, 'applied'), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('copies profile when --profile flag provided', async () => {
    const existingProfile = join(testDir, 'existing.md');
    await writeFile(existingProfile, '# My Profile\n\nExperienced dev.');

    const result = await handleProfile({
      campaignRoot,
      profileFlag: existingProfile,
      cvPath: undefined,
      githubUser: undefined,
      githubToken: undefined,
      linkedinUrl: undefined,
      llmConfig: undefined,
      nonInteractive: false,
    });

    expect(result).toBe('(copied)');
  });

  it('creates skeleton profile when no LLM provided', async () => {
    const result = await handleProfile({
      campaignRoot,
      profileFlag: undefined,
      cvPath: undefined,
      githubUser: 'testuser',
      githubToken: undefined,
      linkedinUrl: undefined,
      llmConfig: undefined,
      nonInteractive: false,
    });

    expect(result).toContain('# Profile — Candidate');
    expect(result).toContain('GitHub: testuser');
  });

  it('builds profile when LLM provided (with CV)', async () => {
    const result = await handleProfile({
      campaignRoot,
      profileFlag: undefined,
      cvPath: '/path/to/cv.pdf',
      githubUser: 'testuser',
      githubToken: 'token',
      linkedinUrl: undefined,
      llmConfig: {
        baseUrl: 'http://localhost:11434/v1',
        apiKey: 'key',
        model: 'model',
        timeoutMs: 300_000,
      },
      nonInteractive: false,
    });

    expect(result).toContain('# Profile — Test User');
  });

  it('builds profile when LLM provided (without CV)', async () => {
    const result = await handleProfile({
      campaignRoot,
      profileFlag: undefined,
      cvPath: undefined,
      githubUser: 'testuser',
      githubToken: 'token',
      linkedinUrl: undefined,
      llmConfig: {
        baseUrl: 'http://localhost:11434/v1',
        apiKey: 'key',
        model: 'model',
        timeoutMs: 300_000,
      },
      nonInteractive: false,
    });

    expect(result).toContain('# Profile — Test User');
  });

  it('includes GitHub user in skeleton profile', async () => {
    const result = await handleProfile({
      campaignRoot,
      profileFlag: undefined,
      cvPath: undefined,
      githubUser: 'myuser',
      githubToken: undefined,
      linkedinUrl: undefined,
      llmConfig: undefined,
      nonInteractive: false,
    });

    expect(result).toContain('GitHub: myuser');
  });

  it('has empty GitHub in skeleton when no user provided', async () => {
    const result = await handleProfile({
      campaignRoot,
      profileFlag: undefined,
      cvPath: undefined,
      githubUser: undefined,
      githubToken: undefined,
      linkedinUrl: undefined,
      llmConfig: undefined,
      nonInteractive: false,
    });

    expect(result).toContain('GitHub: ');
  });

  it('includes LinkedIn URL in skeleton profile', async () => {
    const result = await handleProfile({
      campaignRoot,
      profileFlag: undefined,
      cvPath: undefined,
      githubUser: undefined,
      githubToken: undefined,
      linkedinUrl: 'https://linkedin.com/in/testuser',
      llmConfig: undefined,
      nonInteractive: false,
    });

    expect(result).toContain('LinkedIn: https://linkedin.com/in/testuser');
  });

  it('throws when atomicWrite fails after profile build', async () => {
    vi.mocked(atomicWrite).mockResolvedValueOnce(false);

    await expect(
      handleProfile({
        campaignRoot,
        profileFlag: undefined,
        cvPath: '/path/to/cv.pdf',
        githubUser: 'testuser',
        githubToken: 'token',
        linkedinUrl: undefined,
        llmConfig: {
          baseUrl: 'http://localhost:11434/v1',
          apiKey: 'key',
          model: 'model',
          timeoutMs: 300_000,
        },
        nonInteractive: false,
      }),
    ).rejects.toThrow('failed to write profile');
  });

  it('throws when atomicWrite fails for skeleton profile', async () => {
    vi.mocked(atomicWrite).mockResolvedValueOnce(false);

    await expect(
      handleProfile({
        campaignRoot,
        profileFlag: undefined,
        cvPath: undefined,
        githubUser: undefined,
        githubToken: undefined,
        linkedinUrl: undefined,
        llmConfig: undefined,
        nonInteractive: false,
      }),
    ).rejects.toThrow('failed to write skeleton profile');
  });

  it('throws when --profile copy fails', async () => {
    const dirPath = join(testDir, 'sourcedir');
    await mkdir(dirPath, { recursive: true });

    await expect(
      handleProfile({
        campaignRoot,
        profileFlag: dirPath,
        cvPath: undefined,
        githubUser: undefined,
        githubToken: undefined,
        linkedinUrl: undefined,
        llmConfig: undefined,
        nonInteractive: false,
      }),
    ).rejects.toThrow('Failed to copy profile');
  });

  it('skips role review when nonInteractive is true', async () => {
    // parseTargetRoles is already mocked via vi.mock at top of file
    // re-mock it to return a non-empty array for this test
    vi.mocked(parseTargetRoles).mockReturnValue([
      {
        slug: 'senior-dev',
        title: 'Senior Dev',
        priority: 'primary',
        level: 'Senior',
        domain: '',
        stack: '',
        workStyle: '',
        compensation: '',
        notes: '',
      },
    ]);

    vi.mocked(atomicWrite).mockResolvedValueOnce(true);

    const result = await handleProfile({
      campaignRoot,
      profileFlag: undefined,
      cvPath: '/path/to/cv.pdf',
      githubUser: 'testuser',
      githubToken: 'token',
      linkedinUrl: undefined,
      llmConfig: {
        baseUrl: 'http://localhost:11434/v1',
        apiKey: 'key',
        model: 'model',
        timeoutMs: 300_000,
      },
      nonInteractive: true,
    });

    expect(result).toContain('# Profile — Test User');
  });

  it('triggers role review when roles found and nonInteractive is false', async () => {
    vi.mocked(parseTargetRoles).mockReturnValue([
      {
        slug: 'senior-dev',
        title: 'Senior Dev',
        priority: 'primary',
        level: 'Senior',
        domain: '',
        stack: '',
        workStyle: '',
        compensation: '',
        notes: '',
      },
    ]);
    vi.mocked(atomicWrite).mockResolvedValueOnce(true);
    vi.mocked(select).mockResolvedValue('accept');

    const result = await handleProfile({
      campaignRoot,
      profileFlag: undefined,
      cvPath: '/path/to/cv.pdf',
      githubUser: 'testuser',
      githubToken: 'token',
      linkedinUrl: undefined,
      llmConfig: {
        baseUrl: 'http://localhost:11434/v1',
        apiKey: 'key',
        model: 'model',
        timeoutMs: 300_000,
      },
      nonInteractive: false,
    });

    expect(result).toContain('# Profile — Test User');
  });

  it('adds timeout hint when profile build times out', async () => {
    vi.mocked(buildProfile).mockRejectedValueOnce(new Error('The LLM request timed out'));

    await expect(
      handleProfile({
        campaignRoot,
        profileFlag: undefined,
        cvPath: '/path/to/cv.pdf',
        githubUser: 'testuser',
        githubToken: 'token',
        linkedinUrl: undefined,
        llmConfig: {
          baseUrl: 'http://localhost:11434/v1',
          apiKey: 'key',
          model: 'model',
          timeoutMs: 300_000,
        },
        nonInteractive: false,
      }),
    ).rejects.toThrow('timed out');
  });
});
