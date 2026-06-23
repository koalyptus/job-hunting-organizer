import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Logger } from 'pino';
import { fetchWithFallback } from '../fetch.js';

function mockFetchResponse(
  body: string,
  status = 200,
  url = 'https://example.com/job/123',
): Response {
  const response = new Response(body, {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers({ 'content-type': 'text/html' }),
  });
  Object.defineProperty(response, 'url', { value: url, writable: false });
  return response;
}

describe('fetchWithFallback', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns FetchResult on 200', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(mockFetchResponse('<p>Hello</p>'));

    const result = await fetchWithFallback('https://example.com/job/123');

    expect(result.status).toBe(200);
    expect(result.body).toBe('<p>Hello</p>');
    expect(result.url).toBe('https://example.com/job/123');
    expect(result.headers).toHaveProperty('content-type');
  });

  it('follows redirects', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(
      mockFetchResponse('redirected', 200, 'https://example.com/job/456'),
    );

    const result = await fetchWithFallback('https://example.com/job/123');

    expect(result.url).toBe('https://example.com/job/456');
  });

  it('throws on non-2xx status', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockImplementation(() => Promise.resolve(mockFetchResponse('Not Found', 404)));

    await expect(fetchWithFallback('https://example.com/job/123')).rejects.toThrow(/HTTP 404/);
  });

  it('throws on network error', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockRejectedValue(new TypeError('fetch failed'));

    await expect(fetchWithFallback('https://example.com/job/123')).rejects.toThrow('fetch failed');
  });

  it('throws on timeout', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockRejectedValueOnce(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
    );

    await expect(
      fetchWithFallback('https://example.com/job/123', { timeoutMs: 100 }),
    ).rejects.toThrow(/Timeout/);
  });

  it('sends User-Agent header', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(mockFetchResponse('ok'));

    await fetchWithFallback('https://example.com/job/123');

    const [, init] = fetch.mock.calls[0] as [unknown, RequestInit];
    expect((init?.headers as Record<string, string>)['User-Agent']).toMatch(/^jho\/\d+\.\d+\.\d+$/);
  });

  it('merges custom headers with defaults', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(mockFetchResponse('ok'));

    await fetchWithFallback('https://example.com/job/123', {
      headers: { 'X-Custom': 'value' },
    });

    const [, init] = fetch.mock.calls[0] as [unknown, RequestInit];
    const headers = init?.headers as Record<string, string>;
    expect(headers['X-Custom']).toBe('value');
    expect(headers['User-Agent']).toMatch(/^jho\/\d+\.\d+\.\d+$/);
    expect(headers['Accept']).toContain('text/html');
  });

  it('uses default timeout of 15s when not specified', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(mockFetchResponse('ok'));

    await fetchWithFallback('https://example.com/job/123');

    const [, init] = fetch.mock.calls[0] as [unknown, RequestInit];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('includes response preview in error for non-2xx with body', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockImplementation(() => Promise.resolve(mockFetchResponse('page not found', 404)));

    await expect(fetchWithFallback('https://example.com/job/123')).rejects.toThrow(
      /response preview: page not found/,
    );
  });

  it('omits response preview in error for non-2xx with empty body', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockImplementation(() => Promise.resolve(mockFetchResponse('', 500)));

    await expect(fetchWithFallback('https://example.com/job/123')).rejects.toThrow(
      /HTTP 500 Error fetching/,
    );
  });

  it('logs fetch.start and fetch.complete when logger provided', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(mockFetchResponse('ok'));
    const log = { debug: vi.fn() } as unknown as Logger;

    await fetchWithFallback('https://example.com/job/123', {}, log);

    expect(log.debug).toHaveBeenCalledWith(
      { url: 'https://example.com/job/123', timeoutMs: 30_000 },
      'fetch.start',
    );
    expect(log.debug).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/job/123', status: 200 }),
      'fetch.complete',
    );
  });

  it('clears timeout on success', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(mockFetchResponse('ok'));

    await fetchWithFallback('https://example.com/job/123');

    expect(fetch).toHaveBeenCalledOnce();
  });
});
