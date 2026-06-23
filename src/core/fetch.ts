import type { Logger } from 'pino';
import { getPackageVersion } from './package.js';
import { FETCH_TIMEOUT_MS } from './constants.js';

const JHO_UA = `jho/${getPackageVersion()}`;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/** Max characters of response body included in error messages. */
const RESPONSE_PREVIEW_LENGTH = 200;

/**
 * Result of an HTTP fetch performed by {@link fetchWithFallback}.
 * Carries the raw response data needed by downstream consumers.
 */
export interface FetchResult {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
  readonly url: string;
}

/**
 * Options for {@link fetchWithFallback}.
 */
export interface FetchWithFallbackOptions {
  readonly timeoutMs?: number;
  readonly headers?: Record<string, string>;
}

async function attemptFetch(
  url: string,
  userAgent: string,
  options: FetchWithFallbackOptions,
  log?: Logger,
): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const headers = {
    'User-Agent': userAgent,
    Accept: 'text/html,application/xhtml+xml,text/plain,*/*',
    ...options.headers,
  };

  log?.debug({ url, timeoutMs }, 'fetch.start');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      redirect: 'follow',
    });

    const body = await response.text();

    if (!response.ok) {
      const snippet = body.slice(0, RESPONSE_PREVIEW_LENGTH);
      throw new Error(
        `HTTP ${response.status} ${response.statusText} fetching ${url}` +
          (snippet ? ` — response preview: ${snippet}` : ''),
      );
    }

    log?.debug({ url, status: response.status, bodyLength: body.length }, 'fetch.complete');

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
      url: response.url,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      const err = new Error(`Timeout fetching ${url} after ${timeoutMs}ms`);
      err.name = 'AbortError';
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a URL with user-agent fallback, timeout, and redirect following.
 *
 * Tries the JHO UA first. On non-2xx or network error (but not timeout),
 * retries once with a browser-like UA. If the caller provides a custom
 * `User-Agent` header in options, only that UA is used (no fallback).
 *
 * Returns a {@link FetchResult} with status, headers, body, and final URL.
 *
 * @throws on network errors, non-2xx status codes, or timeouts.
 */
export async function fetchWithFallback(
  url: string,
  options: FetchWithFallbackOptions = {},
  log?: Logger,
): Promise<FetchResult> {
  const uas = options.headers?.['User-Agent']
    ? [options.headers['User-Agent']]
    : [JHO_UA, BROWSER_UA];

  try {
    return await attemptFetch(url, uas[0]!, options, log);
  } catch (firstErr) {
    if (uas.length === 1) {
      throw firstErr;
    }
    if (firstErr instanceof Error && firstErr.name === 'AbortError') {
      throw firstErr;
    }
    log?.debug(
      {
        url,
        error: firstErr instanceof Error ? firstErr.message : String(firstErr),
        fallbackUserAgent: uas[1]!,
      },
      'fetch.retry',
    );
    return await attemptFetch(url, uas[1]!, options, log);
  }
}
