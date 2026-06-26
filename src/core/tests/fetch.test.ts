import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { Logger } from 'pino';
import { createLlmFetch, fetchWithFallback } from '../fetch.js';

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

  it('does not retry with browser UA when custom User-Agent is set', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockRejectedValueOnce(new TypeError('network error'));

    await expect(
      fetchWithFallback('https://example.com/job/123', {
        headers: { 'User-Agent': 'custom-ua/1.0' },
      }),
    ).rejects.toThrow('network error');

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('clears timeout on success', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(mockFetchResponse('ok'));

    await fetchWithFallback('https://example.com/job/123');

    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe('createLlmFetch', () => {
  let server: http.Server;
  let port: number;
  let handler: http.RequestListener;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      handler = (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
      };
      server = http.createServer((req, res) => handler(req, res));
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    };
  });

  it('returns a fetch function', () => {
    const fn = createLlmFetch(5000);
    expect(fn).toBeInstanceOf(Function);
  });

  it('GET returns response body', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('hello world');
    };
    const fetch = createLlmFetch(5000);
    const response = await fetch(`http://127.0.0.1:${port}/test`);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('hello world');
  });

  it('POST sends request body', async () => {
    let receivedBody = '';
    handler = (req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        receivedBody = body;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ echoed: body }));
      });
    };
    const payload = JSON.stringify({ hello: 'world' });
    const fetch = createLlmFetch(5000);
    const response = await fetch(`http://127.0.0.1:${port}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    expect(receivedBody).toBe(payload);
    const data = await response.json();
    expect(data).toEqual({ echoed: payload });
  });

  it('reads response headers', async () => {
    handler = (_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'X-Custom': 'value',
      });
      res.end('{}');
    };
    const fetch = createLlmFetch(5000);
    const response = await fetch(`http://127.0.0.1:${port}/`);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('x-custom')).toBe('value');
  });

  it('flattens multi-value response headers', async () => {
    handler = (_req, res) => {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Set-Cookie', ['a=1', 'b=2']);
      res.end('ok');
    };
    const fetch = createLlmFetch(5000);
    const response = await fetch(`http://127.0.0.1:${port}/`);
    const cookie = response.headers.get('set-cookie');
    expect(cookie).toBe('a=1, b=2');
  });

  it('returns non-2xx status without throwing', async () => {
    handler = (_req, res) => {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('bad request');
    };
    const fetch = createLlmFetch(5000);
    const response = await fetch(`http://127.0.0.1:${port}/`);
    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe('bad request');
  });

  it('rejects on pre-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = createLlmFetch(5000);
    await expect(
      fetch(`http://127.0.0.1:${port}/`, { signal: controller.signal }),
    ).rejects.toThrow();
  });

  it('rejects on signal abort during request', async () => {
    const controller = new AbortController();
    handler = () => {
      // Never respond — abort will cancel the request
    };
    const fetch = createLlmFetch(5000);
    const reqPromise = fetch(`http://127.0.0.1:${port}/`, { signal: controller.signal });
    controller.abort();
    await expect(reqPromise).rejects.toThrow();
  });

  it('rejects on timeout', async () => {
    handler = () => {
      // Never respond
    };
    const fetch = createLlmFetch(200);
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow(/timed out/i);
  }, 5000);

  it('accepts a URL object', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('url-ok');
    };
    const fetch = createLlmFetch(5000);
    const response = await fetch(new URL(`http://127.0.0.1:${port}/u`));
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('url-ok');
  });

  it('rejects on pre-aborted signal with non-Error reason', async () => {
    const controller = new AbortController();
    controller.abort('user cancellation');
    const fetch = createLlmFetch(5000);
    await expect(
      fetch(`http://127.0.0.1:${port}/`, { signal: controller.signal }),
    ).rejects.toThrow();
  });

  it('rejects on signal abort with non-Error reason', async () => {
    const controller = new AbortController();
    handler = () => {
      /* never respond */
    };
    const fetch = createLlmFetch(5000);
    const reqPromise = fetch(`http://127.0.0.1:${port}/`, { signal: controller.signal });
    controller.abort('user cancellation');
    await expect(reqPromise).rejects.toThrow();
  });
});
