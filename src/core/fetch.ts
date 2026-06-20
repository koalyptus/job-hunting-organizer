import type { Logger } from 'pino';
import { getPackageVersion } from './package.js';
import { FETCH_TIMEOUT_MS } from './constants.js';

const USER_AGENT = `jho/${getPackageVersion()}`;

/** Max characters of response body included in error messages. */
const RESPONSE_PREVIEW_LENGTH = 200;

/**
 * Result of an HTTP fetch performed by {@link fetchWithFallback}.
 * Carries the raw response data needed by downstream consumers.
 */
export interface FetchResult {
  /** HTTP status code (e.g. 200, 404). */
  readonly status: number;
  /** Response headers (lowercased keys). */
  readonly headers: Record<string, string>;
  /** Raw response body as text (HTML or plain text). */
  readonly body: string;
  /** Final URL after redirects. */
  readonly url: string;
}

/**
 * Options for {@link fetchWithFallback}.
 */
export interface FetchWithFallbackOptions {
  /** Request timeout in milliseconds. Default: {@link FETCH_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
  /** Additional headers to send with the request. */
  readonly headers?: Record<string, string>;
}

/**
 * Fetch a URL with a user-agent header, timeout, and redirect following.
 * Returns a {@link FetchResult} with status, headers, body, and final URL.
 *
 * @throws on network errors, non-2xx status codes, or timeouts.
 */
export async function fetchWithFallback(
  url: string,
  options: FetchWithFallbackOptions = {},
  log?: Logger,
): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const headers = {
    'User-Agent': USER_AGENT,
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

    const result: FetchResult = {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
      url: response.url,
    };

    if (!response.ok) {
      const snippet = body.slice(0, RESPONSE_PREVIEW_LENGTH);
      throw new Error(
        `HTTP ${response.status} ${response.statusText} fetching ${url}` +
          (snippet ? ` — response preview: ${snippet}` : ''),
      );
    }

    log?.debug({ url, status: response.status, bodyLength: body.length }, 'fetch.complete');

    return result;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timeout fetching ${url} after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
