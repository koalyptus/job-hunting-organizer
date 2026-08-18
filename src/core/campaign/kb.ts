import { join } from 'node:path';
import type { Logger } from 'pino';
import type { CvContent, GithubRepo, GithubUser } from '../types.js';
import type { FileStore } from '../../storage/types.js';
import { campaignStoreFromRoot } from '../../storage/index.js';
import { resolveCampaignRoot } from '../paths.js';

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

const CV_CACHE_PATH = join('knowledge-base', 'cv.json');
const GITHUB_CACHE_PATH = (username: string): string =>
  join('knowledge-base', 'github', `${username}.json`);

/**
 * Resolve the campaign-scoped store (or use the injected one).
 */
function storeFor(campaign: string, store?: FileStore): FileStore {
  return store ?? campaignStoreFromRoot(resolveCampaignRoot(campaign));
}

/**
 * Read cached CV text from the knowledge base through the port.
 * @param campaign - Campaign folder name.
 * @param store - Optional campaign-scoped `FileStore` (for testing).
 * @param log - Optional pino logger.
 * @returns The cached CV content, or `null` if no cache exists or it is corrupted.
 */
export async function readCachedCv(
  campaign: string,
  store?: FileStore,
  log?: Logger,
): Promise<CvContent | null> {
  const st = storeFor(campaign, store);
  try {
    const raw = await st.read(CV_CACHE_PATH);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (log) {
      log.info({ path: CV_CACHE_PATH }, 'kb.cv.read');
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
 * Write CV text to the knowledge base cache through the port.
 * @param campaign - Campaign folder name.
 * @param cv - The CV content to cache.
 * @param store - Optional campaign-scoped `FileStore` (for testing).
 * @param log - Optional pino logger.
 */
export async function writeCachedCv(
  campaign: string,
  cv: CvContent,
  store?: FileStore,
  log?: Logger,
): Promise<void> {
  const st = storeFor(campaign, store);
  const data = {
    text: cv.text,
    format: cv.format,
    fileName: cv.fileName,
    cachedAt: new Date().toISOString(),
  };
  await st.write(CV_CACHE_PATH, JSON.stringify(data, null, 2) + '\n');
  if (log) {
    log.info({ path: CV_CACHE_PATH }, 'kb.cv.write');
  }
}

/**
 * Read cached GitHub data from the knowledge base through the port.
 * @param campaign - Campaign folder name.
 * @param username - GitHub username (used as cache key).
 * @param store - Optional campaign-scoped `FileStore` (for testing).
 * @param log - Optional pino logger.
 * @returns The cached user and repos, or `null` if no cache exists or it is corrupted.
 */
export async function readCachedGithubProfile(
  campaign: string,
  username: string,
  store?: FileStore,
  log?: Logger,
): Promise<{ user: GithubUser; repos: GithubRepo[] } | null> {
  const st = storeFor(campaign, store);
  const path = GITHUB_CACHE_PATH(username);
  try {
    const raw = await st.read(path);
    const parsed = JSON.parse(raw) as CachedGithubData;
    if (log) {
      log.info({ path, username }, 'kb.github.read');
    }
    return { user: parsed.user, repos: parsed.repos };
  } catch {
    return null;
  }
}

/**
 * Write GitHub user and repo data to the knowledge base cache through the port.
 * @param campaign - Campaign folder name.
 * @param username - GitHub username (used as cache key).
 * @param user - The user profile to cache.
 * @param repos - The repos list to cache.
 * @param store - Optional campaign-scoped `FileStore` (for testing).
 * @param log - Optional pino logger.
 */
export async function writeCachedGithubProfile(
  campaign: string,
  username: string,
  user: GithubUser,
  repos: GithubRepo[],
  store?: FileStore,
  log?: Logger,
): Promise<void> {
  const st = storeFor(campaign, store);
  const path = GITHUB_CACHE_PATH(username);
  const data: CachedGithubData = {
    user,
    repos,
    cachedAt: new Date().toISOString(),
  };
  await st.write(path, JSON.stringify(data, null, 2) + '\n');
  if (log) {
    log.info({ path, username }, 'kb.github.write');
  }
}
