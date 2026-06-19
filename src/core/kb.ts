import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from 'pino';
import { atomicWrite, pathExists } from './fs.js';
import { resolveKnowledgeBaseDir } from './paths.js';
import type { CvContent, GithubRepo, GithubUser } from './types.js';

/**
 * Cached GitHub user and repo data, written to
 * `knowledge-base/github/<username>.json`.
 */
interface CachedGithubData {
  /** The user profile snapshot. */
  readonly user: GithubUser;
  /** The repos list snapshot (unfiltered — forks/archives included). */
  readonly repos: GithubRepo[];
  /** ISO-8601 timestamp of when the cache was written. */
  readonly cachedAt: string;
}

/**
 * Read cached CV text from the knowledge base.
 * @param campaignRoot - Absolute path of the campaign root.
 * @param log - Optional pino logger.
 * @returns The cached CV content, or `null` if no cache exists or it is corrupted.
 */
export async function readCachedCv(campaignRoot: string, log?: Logger): Promise<CvContent | null> {
  const kbDir = resolveKnowledgeBaseDir(campaignRoot);
  const cachePath = join(kbDir, 'cv.json');

  if (!(await pathExists(cachePath))) {
    return null;
  }

  try {
    const raw = await readFile(cachePath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (log) {
      log.info({ cachePath }, 'kb.cv.read');
    }

    return {
      text: parsed.text as string,
      format: parsed.format as CvContent['format'],
      fileName: parsed.fileName as string,
    };
  } catch {
    return null;
  }
}

/**
 * Write CV text to the knowledge base cache.
 * @param campaignRoot - Absolute path of the campaign root.
 * @param cv - The CV content to cache.
 * @param log - Optional pino logger.
 */
export async function writeCachedCv(
  campaignRoot: string,
  cv: CvContent,
  log?: Logger,
): Promise<void> {
  const kbDir = resolveKnowledgeBaseDir(campaignRoot);
  const cachePath = join(kbDir, 'cv.json');

  const data = {
    text: cv.text,
    format: cv.format,
    fileName: cv.fileName,
    cachedAt: new Date().toISOString(),
  };

  const written = await atomicWrite(cachePath, JSON.stringify(data, null, 2) + '\n');
  if (!written && log) {
    log.warn({ cachePath }, 'kb.cv.write.failed');
  }

  if (log) {
    log.info({ cachePath }, 'kb.cv.write');
  }
}

/**
 * Read cached GitHub data from the knowledge base.
 * @param campaignRoot - Absolute path of the campaign root.
 * @param username - GitHub username (used as cache key).
 * @param log - Optional pino logger.
 * @returns The cached user and repos, or `null` if no cache exists or it is corrupted.
 */
export async function readCachedGithub(
  campaignRoot: string,
  username: string,
  log?: Logger,
): Promise<{ user: GithubUser; repos: GithubRepo[] } | null> {
  const kbDir = resolveKnowledgeBaseDir(campaignRoot);
  const cachePath = join(kbDir, 'github', `${username}.json`);

  if (!(await pathExists(cachePath))) {
    return null;
  }

  try {
    const raw = await readFile(cachePath, 'utf8');
    const parsed = JSON.parse(raw) as CachedGithubData;

    if (log) {
      log.info({ cachePath, username }, 'kb.github.read');
    }

    return { user: parsed.user, repos: parsed.repos };
  } catch {
    return null;
  }
}

/**
 * Write GitHub user and repo data to the knowledge base cache.
 * @param campaignRoot - Absolute path of the campaign root.
 * @param username - GitHub username (used as cache key).
 * @param user - The user profile to cache.
 * @param repos - The repos list to cache.
 * @param log - Optional pino logger.
 */
export async function writeCachedGithub(
  campaignRoot: string,
  username: string,
  user: GithubUser,
  repos: GithubRepo[],
  log?: Logger,
): Promise<void> {
  const kbDir = resolveKnowledgeBaseDir(campaignRoot);
  const cachePath = join(kbDir, 'github', `${username}.json`);

  const data: CachedGithubData = {
    user,
    repos,
    cachedAt: new Date().toISOString(),
  };

  const written = await atomicWrite(cachePath, JSON.stringify(data, null, 2) + '\n');
  if (!written && log) {
    log.warn({ cachePath, username }, 'kb.github.write.failed');
  }

  if (log) {
    log.info({ cachePath, username }, 'kb.github.write');
  }
}
