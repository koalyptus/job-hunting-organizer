import http from 'node:http';
import https from 'node:https';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithFallback, createLlmFetch } from '../fetch.js';
import { defaultLlmConfig, chatComplete } from '../llm.js';
import { parseFrontmatter, FrontmatterParseError } from '../parser/frontmatter.js';
import { replaceRegion, findSectionMarker, extractSteer } from '../parser/markers.js';
import { looksLikeNaturalLanguage } from '../parser/prompt-parser.js';
import { validateSlug } from '../validate.js';
import { SLUG_PATTERN } from '../parser/slug.js';

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

describe('branch coverage: fetch.ts', () => {
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

describe('branch coverage: llm.ts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('defaultLlmConfig with explicit global skips loadGlobalConfig (branch true for ??)', () => {
    const global = {
      version: 1 as const,
      dataRoot: '/tmp',
      llm: {
        baseUrl: 'https://explicit.com/v1',
        apiKey: 'explicit-key',
        model: 'explicit-model',
        timeoutMs: 9999,
      },
      github: { user: '', token: '', repos: [] },
      logging: { level: 'info' as const, file: '', redactPaths: [] },
      fetch: { timeoutMs: 30000 },
    };
    const result = defaultLlmConfig(global);
    expect(result.baseUrl).toBe('https://explicit.com/v1');
    expect(result.model).toBe('explicit-model');
  });

  it('defaultLlmConfig fallback when global is undefined (line 40)', async () => {
    // Use a fresh import with mocked config to cover loadGlobalConfig path
    // Instead of mocking the module, just call with undefined and rely on global config file fallback
    // If no config file exists, it should return defaults (ollama)
    const result = defaultLlmConfig(undefined);
    // Should have some baseUrl (default is http://localhost:11434/v1 or similar)
    expect(result.baseUrl).toBeTruthy();
  });

  it('chatComplete falls back to createLlmFetch when options.fetch is undefined (line 76)', async () => {
    const mockReq = {
      on: vi.fn().mockReturnThis(),
      write: vi.fn(),
      end: vi.fn(),
      destroy: vi.fn(),
    };
    const successBody = {
      id: 'chatcmpl-abc',
      object: 'chat.completion',
      created: 1700000000,
      model: 'gpt-4o',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello fallback' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    };
    vi.spyOn(https, 'request').mockImplementation(((opts: unknown, cb: unknown) => {
      const fakeRes: unknown = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json' },
        on: (ev: string, handler: (c: Buffer) => void) => {
          if (ev === 'data') {
            handler(Buffer.from(JSON.stringify(successBody)));
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
    const cfg = {
      baseUrl: 'https://api.test.com/v1',
      apiKey: 'sk',
      model: 'gpt-4o',
      timeoutMs: 300_000,
    };
    const result = await chatComplete([{ role: 'user', content: 'Hi' }], cfg, {});
    expect(result.content).toBe('Hello fallback');
    vi.restoreAllMocks();
  });

  it('chatComplete uses provided fetch when supplied (branch false for ??)', async () => {
    const customFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'x',
            object: 'chat.completion',
            created: 0,
            model: 'm',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'custom' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    const cfg = {
      baseUrl: 'https://api.test.com/v1',
      apiKey: 'sk',
      model: 'm',
      timeoutMs: 300_000,
    };
    const result = await chatComplete([{ role: 'user', content: 'Hi' }], cfg, {
      fetch: customFetch as unknown as typeof fetch,
    });
    expect(customFetch).toHaveBeenCalled();
    expect(result.content).toBe('custom');
  });
});

describe('branch coverage: frontmatter.ts', () => {
  it('throws FrontmatterParseError with generic cause when load throws non-YAMLException (lines 60-61)', async () => {
    // Mock js-yaml to throw generic Error
    const originalLoad = await import('js-yaml');
    vi.doMock('js-yaml', async () => {
      // eslint-disable-next-line @typescript-eslint/consistent-type-imports
      const actual = (await vi.importActual('js-yaml')) as typeof import('js-yaml');
      return {
        ...actual,
        load: () => {
          throw new Error('generic failure');
        },
      };
    });
    vi.resetModules();
    const { parseFrontmatter: pf, FrontmatterParseError: FPE } =
      await import('../parser/frontmatter.js');
    const content = '---\nfoo: bar\n---\nbody';
    expect(() => pf(content)).toThrow(FPE);
    try {
      pf(content);
    } catch (e) {
      expect((e as Error).message).toMatch(/invalid YAML in frontmatter/);
      expect((e as FrontmatterParseError).cause).toBeInstanceOf(Error);
    }
    // Restore: import original again to reset
    vi.doUnmock('js-yaml');
    vi.resetModules();
    // Re-establish original for subsequent tests by re-importing js-yaml (no need to assert)
    void originalLoad;
  });

  it('throws FrontmatterParseError with YAMLException cause (branch true)', () => {
    const bad = '---\nfoo: : :\n---\nbody';
    expect(() => parseFrontmatter(bad)).toThrow(FrontmatterParseError);
  });
});

describe('branch coverage: markers.ts', () => {
  it('replaceRegion with empty newContent hits newContent === "" branch (line 177 true)', () => {
    const content =
      '<!-- jho:start:fetched-jd -->\nold content\n<!-- jho:end:fetched-jd -->\n\nuser notes';
    const updated = replaceRegion(content, 'fetched-jd', '');
    expect(updated).toBe(
      '<!-- jho:start:fetched-jd -->\n<!-- jho:end:fetched-jd -->\n\nuser notes',
    );
  });

  it('replaceRegion with content ending newline hits newLines.pop branch (line 178-179)', () => {
    const content = '<!-- jho:start:fetched-jd -->\nold\n<!-- jho:end:fetched-jd -->\n';
    const updated = replaceRegion(content, 'fetched-jd', 'new\n');
    expect(updated).toContain('new\n<!-- jho:end:fetched-jd -->');
    expect(updated).not.toContain('new\n\n<!-- jho:end:fetched-jd -->');
  });

  it('findSectionMarker returns null when section name mismatches (line 201 false)', () => {
    const content = ['<!-- jho:other — some text -->', 'body'].join('\n');
    expect(findSectionMarker(content, 'meta')).toBeNull();
    const content2 = ['<!-- jho:meta — frontmatter is tool-managed -->', 'body'].join('\n');
    expect(findSectionMarker(content2, 'other')).toBeNull();
  });

  it('extractSteer handles undefined group fallback (line 219 ?? "")', () => {
    const originalMatch = String.prototype.match;
    const spy = vi.spyOn(String.prototype, 'match').mockImplementation(function (
      this: string,
      re: unknown,
    ) {
      if (this.includes('jho:steer:')) {
        const fake = ['<!-- jho:steer: -->'] as unknown as RegExpMatchArray;
        return fake;
      }
      return originalMatch.call(this, re as RegExp);
    });
    const result = extractSteer('<!-- jho:steer: something -->');
    expect(result).toBe('');
    spy.mockRestore();
  });

  it('extractSteer returns empty string when no steer marker (covers false branch at line 218)', () => {
    expect(extractSteer('no markers')).toBe('');
  });

  it('findSectionMarker covers match && name branches (both true and false)', () => {
    const content = ['<!-- jho:meta — hello -->', '<!-- jho:other — world -->'].join('\n');
    expect(findSectionMarker(content, 'meta')).not.toBeNull();
    expect(findSectionMarker(content, 'other')).not.toBeNull();
    expect(findSectionMarker(content, 'missing')).toBeNull();
  });
});

describe('branch coverage: prompt-parser.ts', () => {
  it('looksLikeNaturalLanguage handles parts[0] ?? "" and parts[1] ?? "" fallbacks', () => {
    const originalSplit = String.prototype.split as unknown as (sep: string | RegExp) => string[];
    const splitSpy = vi.spyOn(String.prototype, 'split').mockImplementation(function (
      this: string,
      sep: unknown,
    ) {
      if (this === 'list all applications for default campaign' && sep === ' ') {
        return [undefined as unknown as string, 'second'] as unknown as string[];
      }
      // Fallback to original
      return (originalSplit as unknown as (this: string, sep: string) => string[]).call(
        this,
        sep as string,
      );
    });
    const result = looksLikeNaturalLanguage(['list all applications for default campaign']);
    expect(result).toBe(true);
    splitSpy.mockRestore();
  });

  it('looksLikeNaturalLanguage secondWord fallback when parts length 1', () => {
    const originalSplit = String.prototype.split as unknown as (sep: string | RegExp) => string[];
    const splitSpy = vi.spyOn(String.prototype, 'split').mockImplementation(function (
      this: string,
      sep: unknown,
    ) {
      if (this === 'weird input with space' && sep === ' ') {
        return ['weird'] as unknown as string[];
      }
      return (originalSplit as unknown as (this: string, sep: string) => string[]).call(
        this,
        sep as string,
      );
    });
    const result = looksLikeNaturalLanguage(['weird input with space']);
    expect(result).toBe(true);
    splitSpy.mockRestore();
  });
});

describe('branch coverage: validate.ts', () => {
  it('covers mmm ?? "" fallback when mmm is undefined (line 62)', () => {
    const spy = vi.spyOn(SLUG_PATTERN, 'test').mockReturnValue(true);
    const result = validateSlug('2026');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/invalid month/);
    }
    spy.mockRestore();
  });

  it('covers normal validateSlug success path', () => {
    expect(validateSlug('2026-Jun-15-role-company')).toEqual({ ok: true });
  });

  it('covers mmm ?? "" when mmm is defined (branch not fallback)', () => {
    const r = validateSlug('2026-Jan-02-x-y');
    expect(r.ok).toBe(true);
  });
});
