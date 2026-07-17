import { readFile } from 'node:fs/promises';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { GithubUser, GithubRepo } from '../../types.js';
import { buildProfile } from '../../campaign/profile.js';

vi.mock('../../cv.js', () => ({
  readCv: vi.fn(),
}));

vi.mock('../../github.js', () => ({
  fetchGithubUser: vi.fn(),
  fetchGithubRepos: vi.fn(),
}));

vi.mock('../../llm.js', () => ({
  chatComplete: vi.fn(),
}));

vi.mock('../../package.js', () => ({
  getPackageRoot: vi.fn(() => '/mock/package/root'),
  getPackageVersion: vi.fn(() => '0.0.0'),
}));

vi.mock('../../campaign/kb.js', () => ({
  readCachedCv: vi.fn(),
  writeCachedCv: vi.fn(),
  readCachedGithubProfile: vi.fn(),
  writeCachedGithubProfile: vi.fn(),
}));

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual('node:fs/promises');
  return {
    ...actual,
    readFile: vi.fn(),
  };
});

import { readCv } from '../../cv.js';
import { fetchGithubUser, fetchGithubRepos } from '../../github.js';
import { chatComplete } from '../../llm.js';
import {
  readCachedCv,
  writeCachedCv,
  readCachedGithubProfile,
  writeCachedGithubProfile,
} from '../../campaign/kb.js';

const mockReadCv = vi.mocked(readCv);
const mockFetchGithubUser = vi.mocked(fetchGithubUser);
const mockFetchGithubRepos = vi.mocked(fetchGithubRepos);
const mockChatComplete = vi.mocked(chatComplete);
const mockReadFile = vi.mocked(readFile);
const mockReadCachedCv = vi.mocked(readCachedCv);
const mockWriteCachedCv = vi.mocked(writeCachedCv);
const mockReadCachedGithub = vi.mocked(readCachedGithubProfile);
const mockWriteCachedGithub = vi.mocked(writeCachedGithubProfile);

const testLlmConfig = {
  baseUrl: 'https://api.test.com/v1',
  apiKey: 'sk-test',
  model: 'gpt-4o',
  timeoutMs: 300_000,
};

const mockUser = {
  login: 'testuser',
  name: 'Test User',
  bio: 'A test user',
  location: 'Melbourne',
  company: 'Test Co',
  avatar_url: 'https://avatars.githubusercontent.com/u/12345',
  public_repos: 42,
  followers: 100,
  following: 50,
  blog: 'https://testuser.dev',
  created_at: '2020-01-01T00:00:00Z',
};

const mockRepos = [
  {
    name: 'my-project',
    description: 'A test project',
    language: 'TypeScript',
    stargazers_count: 42,
    forks_count: 7,
    topics: ['typescript', 'node'],
    archived: false,
    fork: false,
    pushed_at: '2025-01-01T00:00:00Z',
    html_url: 'https://github.com/testuser/my-project',
  },
  {
    name: 'forked-repo',
    description: 'A fork',
    language: 'JavaScript',
    stargazers_count: 1,
    forks_count: 0,
    topics: [],
    archived: false,
    fork: true,
    pushed_at: '2024-01-01T00:00:00Z',
    html_url: 'https://github.com/testuser/forked-repo',
  },
];

const PROMPT_TEMPLATE = `---
version: 1
recommendedModel: gpt-4o-mini
recommendedTemperature: 0.6
changelog: |
  v1 — initial profile builder prompt
---

You are a career-profile assistant.

## Output format

Return the markdown body.`;

describe('buildProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadCv.mockResolvedValue({
      text: 'John Doe\nSoftware Engineer',
      format: 'text',
      fileName: 'cv.txt',
    });
    mockFetchGithubUser.mockResolvedValue(mockUser as never);
    mockFetchGithubRepos.mockResolvedValue(mockRepos as never);
    mockChatComplete.mockResolvedValue({
      content: '# Profile — Test User\n\n## Summary\n\nA test user.',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 1000,
    });
    mockReadFile.mockResolvedValue(PROMPT_TEMPLATE);
  });

  it('returns generated profile content', async () => {
    const result = await buildProfile({
      cvPath: '/tmp/cv.txt',
      githubUser: 'testuser',
      llmConfig: testLlmConfig,
    });

    expect(result.content).toBe('# Profile — Test User\n\n## Summary\n\nA test user.');
    expect(result.model).toBe('gpt-4o');
    expect(result.durationMs).toBe(1000);
  });

  it('reads the CV file', async () => {
    await buildProfile({
      cvPath: '/tmp/cv.txt',
      githubUser: 'testuser',
      llmConfig: testLlmConfig,
    });

    expect(mockReadCv).toHaveBeenCalledWith('/tmp/cv.txt', undefined);
  });

  it('fetches GitHub user and repos in parallel', async () => {
    await buildProfile({
      cvPath: '/tmp/cv.txt',
      githubUser: 'testuser',
      githubToken: 'ghp_token',
      llmConfig: testLlmConfig,
    });

    expect(mockFetchGithubUser).toHaveBeenCalledWith('testuser', 'ghp_token', undefined);
    expect(mockFetchGithubRepos).toHaveBeenCalledWith('testuser', 'ghp_token', undefined);
  });

  it('filters out forked and archived repos', async () => {
    await buildProfile({
      cvPath: '/tmp/cv.txt',
      githubUser: 'testuser',
      llmConfig: testLlmConfig,
    });

    const call = mockChatComplete.mock.calls[0]!;
    const userMessage = (call[0][1] as { role: string; content: string }).content;
    expect(userMessage).toContain('my-project');
    expect(userMessage).not.toContain('forked-repo');
  });

  it('passes the prompt template as system message', async () => {
    await buildProfile({
      cvPath: '/tmp/cv.txt',
      githubUser: 'testuser',
      llmConfig: testLlmConfig,
    });

    const call = mockChatComplete.mock.calls[0]!;
    const systemMessage = (call[0][0] as { role: string; content: string }).content;
    expect(systemMessage).toContain('career-profile assistant');
  });

  it('passes signal to chatComplete', async () => {
    const signal = new AbortController().signal;
    await buildProfile({
      cvPath: '/tmp/cv.txt',
      githubUser: 'testuser',
      llmConfig: testLlmConfig,
      signal,
    });

    const call = mockChatComplete.mock.calls[0]!;
    expect(call[2]).toMatchObject({ signal });
  });

  it('passes logger to all sub-calls', async () => {
    const log = { info: vi.fn() } as never;
    await buildProfile({
      cvPath: '/tmp/cv.txt',
      githubUser: 'testuser',
      llmConfig: testLlmConfig,
      log,
    });

    expect(mockReadCv).toHaveBeenCalledWith('/tmp/cv.txt', log);
    expect(mockFetchGithubUser).toHaveBeenCalledWith('testuser', undefined, log);
    expect(mockFetchGithubRepos).toHaveBeenCalledWith('testuser', undefined, log);
    expect(mockChatComplete).toHaveBeenCalledWith(
      expect.any(Array),
      testLlmConfig,
      expect.any(Object),
      log,
    );
  });

  it('uses cached CV when available', async () => {
    mockReadCachedCv.mockResolvedValue({
      text: 'Cached CV text',
      format: 'text',
      fileName: 'cv.txt',
    });

    await buildProfile({
      cvPath: '/tmp/cv.txt',
      githubUser: 'testuser',
      llmConfig: testLlmConfig,
      campaignRoot: '/tmp/campaign',
    });

    expect(mockReadCachedCv).toHaveBeenCalledWith('/tmp/campaign', undefined);
    expect(mockReadCv).not.toHaveBeenCalled();
  });

  it('uses cached GitHub data when available', async () => {
    mockReadCachedGithub.mockResolvedValue({
      user: mockUser as GithubUser,
      repos: mockRepos as GithubRepo[],
    });

    await buildProfile({
      cvPath: '/tmp/cv.txt',
      githubUser: 'testuser',
      llmConfig: testLlmConfig,
      campaignRoot: '/tmp/campaign',
    });

    expect(mockReadCachedGithub).toHaveBeenCalledWith('/tmp/campaign', 'testuser', undefined);
    expect(mockFetchGithubUser).not.toHaveBeenCalled();
    expect(mockFetchGithubRepos).not.toHaveBeenCalled();
  });

  it('skips CV reading when cvPath is undefined', async () => {
    await buildProfile({
      githubUser: 'testuser',
      llmConfig: testLlmConfig,
    });

    expect(mockReadCv).not.toHaveBeenCalled();
    const call = mockChatComplete.mock.calls[0]!;
    const userMessage = (call[0][1] as { role: string; content: string }).content;
    expect(userMessage).toContain('(not provided)');
  });

  it('writes cache after fresh CV fetch', async () => {
    mockReadCachedCv.mockResolvedValue(null);

    await buildProfile({
      cvPath: '/tmp/cv.txt',
      githubUser: 'testuser',
      llmConfig: testLlmConfig,
      campaignRoot: '/tmp/campaign',
    });

    expect(mockWriteCachedCv).toHaveBeenCalledWith(
      '/tmp/campaign',
      { text: 'John Doe\nSoftware Engineer', format: 'text', fileName: 'cv.txt' },
      undefined,
    );
  });

  it('writes cache after fresh GitHub fetch', async () => {
    mockReadCachedGithub.mockResolvedValue(null);

    await buildProfile({
      cvPath: '/tmp/cv.txt',
      githubUser: 'testuser',
      llmConfig: testLlmConfig,
      campaignRoot: '/tmp/campaign',
    });

    expect(mockWriteCachedGithub).toHaveBeenCalledWith(
      '/tmp/campaign',
      'testuser',
      mockUser,
      mockRepos,
      undefined,
    );
  });

  it('skips cache entirely when campaignRoot is omitted', async () => {
    await buildProfile({
      cvPath: '/tmp/cv.txt',
      githubUser: 'testuser',
      llmConfig: testLlmConfig,
    });

    expect(mockReadCachedCv).not.toHaveBeenCalled();
    expect(mockReadCachedGithub).not.toHaveBeenCalled();
    expect(mockWriteCachedCv).not.toHaveBeenCalled();
    expect(mockWriteCachedGithub).not.toHaveBeenCalled();
  });

  it('includes LinkedIn URL in user message when provided', async () => {
    await buildProfile({
      cvPath: '/tmp/cv.txt',
      githubUser: 'testuser',
      linkedinUrl: 'https://linkedin.com/in/testuser',
      llmConfig: testLlmConfig,
    });

    const call = mockChatComplete.mock.calls[0]!;
    const userMessage = (call[0][1] as { role: string; content: string }).content;
    expect(userMessage).toContain('- LinkedIn: https://linkedin.com/in/testuser');
  });

  it('omits LinkedIn line from user message when not provided', async () => {
    await buildProfile({
      cvPath: '/tmp/cv.txt',
      githubUser: 'testuser',
      llmConfig: testLlmConfig,
    });

    const call = mockChatComplete.mock.calls[0]!;
    const userMessage = (call[0][1] as { role: string; content: string }).content;
    expect(userMessage).not.toContain('LinkedIn');
  });

  it('throws when LLM returns empty content', async () => {
    mockChatComplete.mockRejectedValue(new Error('LLM returned empty or unexpected response'));

    await expect(
      buildProfile({
        cvPath: '/tmp/cv.txt',
        githubUser: 'testuser',
        llmConfig: testLlmConfig,
      }),
    ).rejects.toThrow('empty or unexpected response');
  });

  describe('branch coverage — template literal fallbacks', () => {
    it('falls back to user login when name is missing', async () => {
      mockFetchGithubUser.mockResolvedValue({
        ...mockUser,
        name: undefined,
      } as never);

      await buildProfile({
        cvPath: '/tmp/cv.txt',
        githubUser: 'testuser',
        llmConfig: testLlmConfig,
      });

      const [messages] = mockChatComplete.mock.calls[0]!;
      const msg = messages[1]!.content;
      expect(msg).toContain('- Name: testuser');
    });

    it('uses fallback text for missing bio, location, and company', async () => {
      mockFetchGithubUser.mockResolvedValue({
        ...mockUser,
        bio: undefined,
        location: undefined,
        company: undefined,
      } as never);

      await buildProfile({
        cvPath: '/tmp/cv.txt',
        githubUser: 'testuser',
        llmConfig: testLlmConfig,
      });

      const [messages] = mockChatComplete.mock.calls[0]!;
      const msg = messages[1]!.content;
      expect(msg).toContain('- Bio: (none)');
      expect(msg).toContain('- Location: (not specified)');
      expect(msg).toContain('- Company: (not specified)');
    });

    it('handles repos with no description', async () => {
      mockFetchGithubRepos.mockResolvedValue([
        {
          name: 'no-desc',
          description: null,
          language: 'Python',
          stargazers_count: 0,
          forks_count: 0,
          topics: [],
          archived: false,
          fork: false,
          pushed_at: '2025-01-01T00:00:00Z',
          html_url: 'https://github.com/testuser/no-desc',
        },
      ] as never);

      await buildProfile({
        cvPath: '/tmp/cv.txt',
        githubUser: 'testuser',
        llmConfig: testLlmConfig,
      });

      const [messages] = mockChatComplete.mock.calls[0]!;
      const msg = messages[1]!.content;
      expect(msg).toContain('no description');
    });

    it('shows no repos found when all repos are filtered out', async () => {
      mockFetchGithubRepos.mockResolvedValue([
        {
          ...mockRepos[0]!,
          fork: true,
          archived: true,
        },
      ] as never);

      await buildProfile({
        cvPath: '/tmp/cv.txt',
        githubUser: 'testuser',
        llmConfig: testLlmConfig,
      });

      const [messages] = mockChatComplete.mock.calls[0]!;
      const msg = messages[1]!.content;
      expect(msg).toContain('no repos found');
    });
  });
});
