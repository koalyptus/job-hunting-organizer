import {
  AuthenticationError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  RateLimitError,
} from 'openai';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { chatComplete, defaultLlmConfig, parseJsonResult } from '../llm.js';

const testConfig = {
  baseUrl: 'https://api.test.com/v1',
  apiKey: 'sk-test',
  model: 'gpt-4o',
};

const testGlobalConfig = {
  version: 1 as const,
  dataRoot: '/tmp',
  llm: { baseUrl: 'https://config.com/v1', apiKey: 'sk-config', model: 'gpt-4' },
  github: { user: '', token: '', repos: [] },
  calendar: {
    defaultProvider: 'ics' as const,
    outlook: { tenantId: '', clientId: '', clientSecret: '' },
  },
  logging: { level: 'info' as const, file: '', redactPaths: [] },
};

function okJson(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errJson(status: number, body?: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body ?? { error: { message: 'API error', type: 'error' } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const successBody = {
  id: 'chatcmpl-abc',
  object: 'chat.completion',
  created: 1700000000,
  model: 'gpt-4o',
  choices: [{ index: 0, message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
};

describe('chatComplete', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('success', () => {
    it('returns the completion content', async () => {
      const fetch = vi.mocked(globalThis.fetch);
      fetch.mockResolvedValueOnce(okJson(successBody));

      const result = await chatComplete([{ role: 'user', content: 'Hi' }], testConfig);

      expect(result.content).toBe('Hello!');
      expect(result.model).toBe('gpt-4o');
    });

    it('returns usage information', async () => {
      const fetch = vi.mocked(globalThis.fetch);
      fetch.mockResolvedValueOnce(okJson(successBody));

      const result = await chatComplete([{ role: 'user', content: 'Hi' }], testConfig);

      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('sends JSON mode params when jsonMode is true', async () => {
      const fetch = vi.mocked(globalThis.fetch);
      fetch.mockResolvedValueOnce(
        okJson({
          ...successBody,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: '{"key":"value"}' },
              finish_reason: 'stop',
            },
          ],
        }),
      );

      await chatComplete([{ role: 'user', content: 'Return JSON' }], testConfig, {
        jsonMode: true,
      });

      const [, init] = fetch.mock.calls[0] as [unknown, { body?: string }];
      const callBody = JSON.parse(init?.body ?? '{}');
      expect(callBody.response_format).toEqual({ type: 'json_object' });
    });

    it('handles null content from the model', async () => {
      const fetch = vi.mocked(globalThis.fetch);
      fetch.mockResolvedValueOnce(
        okJson({
          ...successBody,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: null },
              finish_reason: 'content_filter',
            },
          ],
        }),
      );

      const result = await chatComplete([{ role: 'user', content: 'Hi' }], testConfig);

      expect(result.content).toBe('');
    });

    it('handles response without usage', async () => {
      const fetch = vi.mocked(globalThis.fetch);
      fetch.mockResolvedValueOnce(
        okJson({
          ...successBody,
          usage: undefined,
        }),
      );

      const result = await chatComplete([{ role: 'user', content: 'Hi' }], testConfig);

      expect(result.usage).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    });

    it('sends max_tokens when specified', async () => {
      const fetch = vi.mocked(globalThis.fetch);
      fetch.mockResolvedValueOnce(okJson(successBody));

      await chatComplete([{ role: 'user', content: 'Hi' }], testConfig, { maxTokens: 500 });

      const [, init] = fetch.mock.calls[0] as [unknown, { body?: string }];
      const callBody = JSON.parse(init?.body ?? '{}');
      expect(callBody.max_tokens).toBe(500);
    });
  });

  describe('error handling', () => {
    it('throws AuthenticationError on 401', async () => {
      const fetch = vi.mocked(globalThis.fetch);
      fetch.mockResolvedValueOnce(
        errJson(401, { error: { message: 'Invalid API key', type: 'invalid_request_error' } }),
      );

      await expect(chatComplete([{ role: 'user', content: 'Hi' }], testConfig)).rejects.toThrow(
        AuthenticationError,
      );
    });

    it('throws RateLimitError on 429', async () => {
      const fetch = vi.mocked(globalThis.fetch);
      fetch.mockResolvedValueOnce(
        errJson(429, { error: { message: 'Rate limit exceeded', type: 'rate_limit_error' } }),
      );

      await expect(chatComplete([{ role: 'user', content: 'Hi' }], testConfig)).rejects.toThrow(
        RateLimitError,
      );
    });

    it('throws BadRequestError on 400', async () => {
      const fetch = vi.mocked(globalThis.fetch);
      fetch.mockResolvedValueOnce(
        errJson(400, { error: { message: 'Bad request', type: 'invalid_request_error' } }),
      );

      await expect(chatComplete([{ role: 'user', content: 'Hi' }], testConfig)).rejects.toThrow(
        BadRequestError,
      );
    });

    it('throws InternalServerError on 500', async () => {
      const fetch = vi.mocked(globalThis.fetch);
      fetch.mockResolvedValueOnce(
        errJson(500, { error: { message: 'Internal error', type: 'server_error' } }),
      );

      await expect(chatComplete([{ role: 'user', content: 'Hi' }], testConfig)).rejects.toThrow(
        InternalServerError,
      );
    });

    it('throws on fetch network failure', async () => {
      const fetch = vi.mocked(globalThis.fetch);
      fetch.mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(chatComplete([{ role: 'user', content: 'Hi' }], testConfig)).rejects.toThrow();
    });

    it('throws on abort signal', async () => {
      const fetch = vi.mocked(globalThis.fetch);
      fetch.mockRejectedValueOnce(
        Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
      );

      await expect(chatComplete([{ role: 'user', content: 'Hi' }], testConfig)).rejects.toThrow();
    });

    it('throws ConflictError on 409', async () => {
      const fetch = vi.mocked(globalThis.fetch);
      fetch.mockResolvedValueOnce(
        errJson(409, { error: { message: 'Conflict', type: 'conflict_error' } }),
      );

      await expect(chatComplete([{ role: 'user', content: 'Hi' }], testConfig)).rejects.toThrow(
        ConflictError,
      );
    });
  });

  describe('logging', () => {
    it('logs completion when a logger is provided', async () => {
      const fetch = vi.mocked(globalThis.fetch);
      fetch.mockResolvedValueOnce(okJson(successBody));

      const log = { info: vi.fn() };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await chatComplete([{ role: 'user', content: 'Hi' }], testConfig, {}, log as any);

      expect(log.info).toHaveBeenCalledOnce();
      expect(log.info).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o',
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
          durationMs: expect.any(Number),
        }),
        'llm.complete',
      );
    });
  });
});

describe('defaultLlmConfig', () => {
  it('reads settings from global config', () => {
    const cfg = defaultLlmConfig(testGlobalConfig);
    expect(cfg.baseUrl).toBe('https://config.com/v1');
    expect(cfg.apiKey).toBe('sk-config');
    expect(cfg.model).toBe('gpt-4');
  });

  describe('env var overrides', () => {
    const kept: Record<string, string | undefined> = {};

    beforeEach(() => {
      kept['LLM_API_KEY'] = process.env['LLM_API_KEY'];
      kept['LLM_BASE_URL'] = process.env['LLM_BASE_URL'];
      kept['LLM_MODEL'] = process.env['LLM_MODEL'];
      delete process.env['LLM_API_KEY'];
      delete process.env['LLM_BASE_URL'];
      delete process.env['LLM_MODEL'];
    });

    afterEach(() => {
      for (const [k, v] of Object.entries(kept)) {
        if (v === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = v;
        }
      }
    });

    it('LLM_API_KEY overrides config', () => {
      process.env['LLM_API_KEY'] = 'env-key';
      expect(defaultLlmConfig(testGlobalConfig).apiKey).toBe('env-key');
    });

    it('LLM_BASE_URL overrides config', () => {
      process.env['LLM_BASE_URL'] = 'https://env.com/v1';
      expect(defaultLlmConfig(testGlobalConfig).baseUrl).toBe('https://env.com/v1');
    });

    it('LLM_MODEL overrides config', () => {
      process.env['LLM_MODEL'] = 'env-model';
      expect(defaultLlmConfig(testGlobalConfig).model).toBe('env-model');
    });
  });
});

describe('parseJsonResult', () => {
  it('parses JSON without schema', () => {
    const result = parseJsonResult('{"a":1}');
    expect(result).toEqual({ a: 1 });
  });

  it('validates against a Zod schema', () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = parseJsonResult('{"name":"Alice","age":30}', schema);
    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  it('throws ZodError on schema mismatch', () => {
    const schema = z.object({ name: z.string() });
    expect(() => parseJsonResult('{"name":123}', schema)).toThrow(z.ZodError);
  });

  it('throws SyntaxError on invalid JSON', () => {
    expect(() => parseJsonResult('not json')).toThrow(SyntaxError);
  });
});
