import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { GithubUser, GithubRepo } from '../types.js';
import { readCachedCv, writeCachedCv, readCachedGithub, writeCachedGithub } from '../kb.js';

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
} as GithubUser;

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
] as GithubRepo[];

describe('readCachedCv', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-kb-cv-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('returns null when no cache exists', async () => {
    const result = await readCachedCv(workDir);
    expect(result).toBeNull();
  });

  it('returns null for corrupted JSON', async () => {
    const cacheDir = join(workDir, 'knowledge-base');
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, 'cv.json'), 'NOT JSON');

    const result = await readCachedCv(workDir);
    expect(result).toBeNull();
  });

  it('reads a valid cache file', async () => {
    const cacheDir = join(workDir, 'knowledge-base');
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      join(cacheDir, 'cv.json'),
      JSON.stringify({
        text: 'John Doe\nSoftware Engineer',
        format: 'text',
        fileName: 'cv.txt',
        cachedAt: '2025-01-01T00:00:00.000Z',
      }),
    );

    const result = await readCachedCv(workDir);
    expect(result).not.toBeNull();
    expect(result!.text).toBe('John Doe\nSoftware Engineer');
    expect(result!.format).toBe('text');
    expect(result!.fileName).toBe('cv.txt');
  });
});

describe('writeCachedCv', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-kb-cv-write-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('writes and reads back round-trip', async () => {
    await writeCachedCv(workDir, {
      text: 'Jane Doe\nProduct Manager',
      format: 'pdf',
      fileName: 'cv.pdf',
    });

    const result = await readCachedCv(workDir);
    expect(result).not.toBeNull();
    expect(result!.text).toBe('Jane Doe\nProduct Manager');
    expect(result!.format).toBe('pdf');
    expect(result!.fileName).toBe('cv.pdf');
  });

  it('creates parent directories automatically', async () => {
    await writeCachedCv(workDir, {
      text: 'content',
      format: 'text',
      fileName: 'cv.txt',
    });

    expect(existsSync(join(workDir, 'knowledge-base', 'cv.json'))).toBe(true);
  });
});

describe('readCachedGithub', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-kb-gh-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('returns null when no cache exists', async () => {
    const result = await readCachedGithub(workDir, 'testuser');
    expect(result).toBeNull();
  });

  it('returns null for corrupted JSON', async () => {
    const cacheDir = join(workDir, 'knowledge-base', 'github');
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, 'testuser.json'), '{bad');

    const result = await readCachedGithub(workDir, 'testuser');
    expect(result).toBeNull();
  });

  it('reads a valid cache file', async () => {
    const cacheDir = join(workDir, 'knowledge-base', 'github');
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      join(cacheDir, 'testuser.json'),
      JSON.stringify({ user: mockUser, repos: mockRepos, cachedAt: new Date().toISOString() }),
    );

    const result = await readCachedGithub(workDir, 'testuser');
    expect(result).not.toBeNull();
    expect(result!.user.login).toBe('testuser');
    expect(result!.repos).toHaveLength(1);
  });
});

describe('writeCachedGithub', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-kb-gh-write-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('writes and reads back round-trip', async () => {
    await writeCachedGithub(workDir, 'testuser', mockUser, mockRepos);

    const result = await readCachedGithub(workDir, 'testuser');
    expect(result).not.toBeNull();
    expect(result!.user.login).toBe('testuser');
    expect(result!.repos).toHaveLength(1);
    expect(result!.repos[0]!.name).toBe('my-project');
  });

  it('creates parent directories automatically', async () => {
    await writeCachedGithub(workDir, 'testuser', mockUser, mockRepos);

    expect(existsSync(join(workDir, 'knowledge-base', 'github', 'testuser.json'))).toBe(true);
  });

  it('includes cachedAt timestamp', async () => {
    await writeCachedGithub(workDir, 'testuser', mockUser, mockRepos);

    const raw = readFileSync(join(workDir, 'knowledge-base', 'github', 'testuser.json'), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.cachedAt).toBeDefined();
    expect(new Date(parsed.cachedAt).getTime()).toBeGreaterThan(0);
  });
});
