import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchGithubUser, fetchGithubRepos } from '../github.js';

const USER_PROFILE_RESPONSE = {
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

const REPO_RESPONSE = [
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
    name: 'old-project',
    description: null,
    language: null,
    stargazers_count: 0,
    forks_count: 0,
    topics: [],
    archived: true,
    fork: true,
    pushed_at: '2024-01-01T00:00:00Z',
    html_url: 'https://github.com/testuser/old-project',
  },
];

function okJson(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errJson(status: number): Response {
  return new Response(JSON.stringify({ message: 'error' }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function rateLimitedResponse(): Response {
  return new Response(JSON.stringify({ message: 'rate limited' }), {
    status: 403,
    headers: {
      'Content-Type': 'application/json',
      'X-RateLimit-Remaining': '0',
    },
  });
}

describe('fetchGithubUser', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the user profile', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(okJson(USER_PROFILE_RESPONSE));

    const result = await fetchGithubUser('testuser');

    expect(result.login).toBe('testuser');
    expect(result.name).toBe('Test User');
    expect(result.bio).toBe('A test user');
    expect(result.avatar_url).toBe('https://avatars.githubusercontent.com/u/12345');
    expect(result.public_repos).toBe(42);
  });

  it('passes the Authorization header when token is provided', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(okJson(USER_PROFILE_RESPONSE));

    await fetchGithubUser('testuser', 'ghp_token');

    const [url, opts] = fetch.mock.calls[0] as [string, { headers?: Record<string, string> }];
    expect(url).toBe('https://api.github.com/users/testuser');
    expect(opts.headers?.['Authorization']).toBe('Bearer ghp_token');
  });

  it('throws on 404', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(errJson(404));

    await expect(fetchGithubUser('nonexistent')).rejects.toThrow('GitHub API returned 404 for');
  });

  it('throws on 401', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(errJson(401));

    await expect(fetchGithubUser('testuser')).rejects.toThrow('GitHub API returned 401 for');
  });

  it('throws on rate limit (403 with header)', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(rateLimitedResponse());

    await expect(fetchGithubUser('testuser')).rejects.toThrow('GitHub API rate limit exceeded');
  });

  it('throws on network failure', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(fetchGithubUser('testuser')).rejects.toThrow('Network error');
  });

  it('logs when a logger is provided', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(okJson(USER_PROFILE_RESPONSE));

    const log = { info: vi.fn() };
    await fetchGithubUser('testuser', undefined, log as never);

    expect(log.info).toHaveBeenCalledOnce();
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://api.github.com/users/testuser' }),
      'github.fetch',
    );
  });
});

describe('fetchGithubRepos', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the list of repos', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(okJson(REPO_RESPONSE));

    const result = await fetchGithubRepos('testuser');

    expect(result).toHaveLength(2);
    const first = result[0]!;
    expect(first.name).toBe('my-project');
    expect(first.description).toBe('A test project');
    expect(first.language).toBe('TypeScript');
    expect(first.stargazers_count).toBe(42);
    expect(first.forks_count).toBe(7);
    expect(first.topics).toEqual(['typescript', 'node']);
    expect(first.archived).toBe(false);
    expect(first.fork).toBe(false);
    expect(first.pushed_at).toBe('2025-01-01T00:00:00Z');
    expect(first.html_url).toBe('https://github.com/testuser/my-project');
  });

  it('returns empty array when the user has no repos', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(okJson([]));

    const result = await fetchGithubRepos('testuser');

    expect(result).toEqual([]);
  });

  it('requests repos sorted by push date', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(okJson(REPO_RESPONSE));

    await fetchGithubRepos('testuser');

    const [url] = fetch.mock.calls[0] as [string];
    expect(url).toContain('sort=pushed');
    expect(url).toContain('per_page=100');
    expect(url).toContain('direction=desc');
  });

  it('throws on 404', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(errJson(404));

    await expect(fetchGithubRepos('nonexistent')).rejects.toThrow('GitHub API returned 404 for');
  });

  it('throws on network failure', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(fetchGithubRepos('testuser')).rejects.toThrow('Network error');
  });
});
