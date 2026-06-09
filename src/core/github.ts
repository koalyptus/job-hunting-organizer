import type { Logger } from 'pino';
import type { GithubRepo, GithubUser } from './types.js';

const GITHUB_API = 'https://api.github.com';

function headers(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'job-hunting-organizer',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function errorMessage(status: number, url: string): string {
  return `GitHub API returned ${status} for ${url}`;
}

async function githubFetch<T>(url: string, token?: string, log?: Logger): Promise<T> {
  if (log) {
    log.info({ url }, 'github.fetch');
  }

  let response: Response;
  try {
    response = await fetch(url, { headers: headers(token) });
  } catch (err) {
    throw new Error(`Network error fetching ${url}: ${(err as Error).message}`);
  }

  if (response.ok) {
    return (await response.json()) as T;
  }

  const remaining = response.headers.get('X-RateLimit-Remaining');
  if (remaining === '0') {
    throw new Error('GitHub API rate limit exceeded');
  }

  throw new Error(errorMessage(response.status, url));
}

/**
 * Fetch a GitHub user's public profile.
 * @param user - GitHub username.
 * @param token - Optional personal access token (avoids strict rate limits).
 * @param log - Optional pino logger; logs the request URL.
 * @returns The user's public profile, typed via {@link GithubUser}.
 */
export async function fetchGithubUser(
  user: string,
  token?: string,
  log?: Logger,
): Promise<GithubUser> {
  return githubFetch<GithubUser>(`${GITHUB_API}/users/${encodeURIComponent(user)}`, token, log);
}

/**
 * Fetch a GitHub user's public repositories, sorted by most recently pushed.
 * Returns up to 100 repos (the API max per page).
 * @param user - GitHub username.
 * @param token - Optional personal access token (avoids strict rate limits).
 * @param log - Optional pino logger; logs the request URL.
 * @returns An array of repos, each typed via {@link GithubRepo}.
 */
export async function fetchGithubRepos(
  user: string,
  token?: string,
  log?: Logger,
): Promise<GithubRepo[]> {
  return githubFetch<GithubRepo[]>(
    `${GITHUB_API}/users/${encodeURIComponent(user)}/repos?sort=pushed&per_page=100&direction=desc`,
    token,
    log,
  );
}
