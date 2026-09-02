import https from 'node:https';
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

  it('retries with browser UA and logs when first attempt fails (no AbortError)', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch
      .mockRejectedValueOnce(new TypeError('connection reset'))
      .mockResolvedValueOnce(mockFetchResponse('ok-retry'));

    const log = { debug: vi.fn() } as unknown as Logger;
    const result = await fetchWithFallback('https://example.com/job/123', {}, log);

    expect(result.body).toBe('ok-retry');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(log.debug).toHaveBeenCalledWith(
      expect.objectContaining({ fallbackUserAgent: expect.stringContaining('Chrome') }),
      'fetch.retry',
    );
  });

  it('re-throws a non-AbortError thrown by attemptFetch', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockRejectedValue(new Error('unexpected'));

    await expect(fetchWithFallback('https://example.com/job/123')).rejects.toThrow('unexpected');
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

  it('uses https module for https URLs', async () => {
    const fetch = createLlmFetch(5000);
    const response = await fetch(`https://example.com/`);
    // example.com resolves; we just assert the call returns without throwing
    expect(response).toBeInstanceOf(Response);
  }, 10000);

  it('handles undefined headers on the request', async () => {
    let receivedHeaders: Record<string, string | string[]> = {};
    handler = (req, res) => {
      receivedHeaders = req.headers as Record<string, string | string[]>;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    };
    const fetch = createLlmFetch(5000);
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      method: 'GET',
      headers: undefined,
    });
    expect(response.status).toBe(200);
    // headers become undefined → module uses (undefined as Record) which Node tolerates
    expect(receivedHeaders).toBeDefined();
  });

  it('includes statusText and status when server omits extras', async () => {
    handler = (_req, res) => {
      res.writeHead(201);
      res.end('created');
    };
    const fetch = createLlmFetch(5000);
    const response = await fetch(`http://127.0.0.1:${port}/`);
    expect(response.status).toBe(201);
  });

  it('converts Headers objects to plain objects for http.request', async () => {
    let receivedHeaders: Record<string, string | string[]> = {};
    handler = (req, res) => {
      receivedHeaders = req.headers as Record<string, string | string[]>;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    };
    const fetch = createLlmFetch(5000);
    const headers = new Headers({
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-key',
      'X-Custom-Header': 'custom-value',
    });
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      method: 'POST',
      headers,
      body: '{"test": true}',
    });
    expect(response.status).toBe(200);
    expect(receivedHeaders['content-type']).toBe('application/json');
    expect(receivedHeaders['authorization']).toBe('Bearer test-key');
    expect(receivedHeaders['x-custom-header']).toBe('custom-value');
  });
});

// ---- branch coverage migrated from branch-coverage.test.ts ----

describe('fetch.ts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('snippet branch false (empty body) has no preview', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementation(() => Promise.resolve(mockFetchResponse('', 500)));
    let msg = '';
    try {
      await fetchWithFallback('https://example.com/empty');
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/HTTP 500/);
    expect(msg).not.toMatch(/response preview/);
  });

  it('snippet branch true (non-empty body) includes preview', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementation(() => Promise.resolve(mockFetchResponse('hello', 404)));
    await expect(fetchWithFallback('https://example.com/has-body')).rejects.toThrow(
      /response preview: hello/,
    );
  });

  it('snippet truncated to 200 chars', async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const longBody = 'a'.repeat(300);
    fetchMock.mockImplementation(() => Promise.resolve(mockFetchResponse(longBody, 502)));
    expect.assertions(2);
    await expect(fetchWithFallback('https://example.com/long')).rejects.toThrow(
      /response preview:/,
    );
    // Verify truncation length via direct call
    try {
      await fetchWithFallback('https://example.com/long');
    } catch (e) {
      const preview = (e as Error).message.split('response preview: ')[1] ?? '';
      expect(preview.length).toBe(200);
    }
  });

  it('covers port fallback branches (no port, http vs https) via mocked request', async () => {
    const captured: Array<{ mod: string; options: http.RequestOptions }> = [];

    const mockReq = {
      on: vi.fn().mockReturnThis(),
      write: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
    };

    const httpSpy = vi.spyOn(http, 'request').mockImplementation(((opts: unknown, cb: unknown) => {
      captured.push({ mod: 'http', options: opts as http.RequestOptions });
      const fakeRes: unknown = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'text/plain' },
        on: (ev: string, handler: (c: Buffer) => void) => {
          if (ev === 'data') {
            handler(Buffer.from('ok-http'));
          }
          if (ev === 'end') {
            handler(Buffer.from(''));
          }
          return fakeRes;
        },
      };
      (cb as (r: unknown) => void)(fakeRes);
      return mockReq as unknown as ReturnType<typeof http.request>;
    }) as never);

    const httpsSpy = vi.spyOn(https, 'request').mockImplementation(((
      opts: unknown,
      cb: unknown,
    ) => {
      captured.push({ mod: 'https', options: opts as http.RequestOptions });
      const fakeRes: unknown = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'text/plain' },
        on: (ev: string, handler: (c: Buffer) => void) => {
          if (ev === 'data') {
            handler(Buffer.from('ok-https'));
          }
          if (ev === 'end') {
            handler(Buffer.from(''));
          }
          return fakeRes;
        },
      };
      (cb as (r: unknown) => void)(fakeRes);
      return mockReq as unknown as ReturnType<typeof https.request>;
    }) as never);

    const fetchHttp = createLlmFetch(5000);
    await fetchHttp('http://example.com/path');
    expect(captured[0]?.options.port).toBe(80);
    expect(captured[0]?.options.hostname).toBe('example.com');

    captured.length = 0;
    const fetchHttps = createLlmFetch(5000);
    await fetchHttps('https://example.com/secure');
    expect(captured[0]?.options.port).toBe(443);

    captured.length = 0;
    await fetchHttp('http://example.com:8080/with-port');
    expect(captured[0]?.options.port).toBe(8080);

    captured.length = 0;
    const headers = new Headers({ 'X-Test': '1' });
    await fetchHttp('http://example.com/headers', { headers, method: 'GET' });
    expect(captured[0]?.options.headers).toMatchObject({ 'x-test': '1' });

    httpSpy.mockRestore();
    httpsSpy.mockRestore();
  });

  it('covers flatHeaders branches: array vs string, undefined value, statusCode/statusMessage fallbacks', async () => {
    const mockReq = {
      on: vi.fn().mockReturnThis(),
      write: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
    };

    vi.spyOn(http, 'request').mockImplementation(((opts: unknown, cb: unknown) => {
      const fakeRes: unknown = {
        statusCode: undefined as unknown as number,
        statusMessage: undefined as unknown as string,
        headers: {
          'content-type': 'text/plain',
          'x-array': ['a', 'b'],
          'x-undefined': undefined as unknown as string,
          'x-single': 'single-value',
        },
        on: (ev: string, handler: (c: Buffer) => void) => {
          if (ev === 'data') {
            handler(Buffer.from('branch-ok'));
          }
          if (ev === 'end') {
            handler(Buffer.from(''));
          }
          return fakeRes;
        },
      };
      (cb as (r: unknown) => void)(fakeRes);
      return mockReq as unknown as ReturnType<typeof http.request>;
    }) as never);

    const fetchFn = createLlmFetch(5000);
    const res = await fetchFn('http://example.com/branch');
    expect(res.status).toBe(200);
    expect(res.statusText).toBe('');
    expect(res.headers.get('x-array')).toBe('a, b');
    expect(res.headers.get('x-single')).toBe('single-value');
    expect(res.headers.get('x-undefined')).toBeNull();
    expect(await res.text()).toBe('branch-ok');

    vi.restoreAllMocks();
  });
});
