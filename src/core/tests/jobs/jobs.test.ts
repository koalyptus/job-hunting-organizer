import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Logger } from 'pino';
import * as llmModule from '../../llm.js';
import { stripHtml, extractJdFromText, extractJdFromUrl } from '../../jobs/extract.js';
import type { ExtractedJd } from '../../jobs/types.js';
import type { LlmConfig } from '../../types.js';

const testLlmConfig: LlmConfig = {
  baseUrl: 'https://api.test.com/v1',
  apiKey: 'sk-test',
  model: 'gpt-4o',
};

const mockChatComplete = vi.fn();

vi.mock('../../llm.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    chatComplete: (...args: unknown[]) => mockChatComplete(...args),
  };
});

vi.mock('../../config.js', () => ({
  loadGlobalConfig: vi.fn(() => ({
    version: 1,
    dataRoot: '/tmp',
    llm: { baseUrl: 'https://config.com/v1', apiKey: 'sk-config', model: 'gpt-4' },
    github: { user: '', token: '', repos: [] },
    calendar: {
      defaultProvider: 'ics',
      outlook: { tenantId: '', clientId: '', clientSecret: '' },
    },
    logging: { level: 'info', file: '', redactPaths: [] },
  })),
}));

function mockLlmResponse(jd: Partial<ExtractedJd>): void {
  mockChatComplete.mockResolvedValueOnce({
    content: JSON.stringify({
      title: 'Software Engineer',
      company: 'Test Corp',
      ...jd,
    }),
    model: 'gpt-4o',
    finishReason: 'stop',
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    durationMs: 200,
  });
}

beforeEach(() => {
  mockChatComplete.mockReset();
});

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

describe('stripHtml', () => {
  it('removes HTML tags', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
  });

  it('decodes HTML entities', () => {
    expect(stripHtml('a &amp; b &lt; c &gt; d')).toBe('a & b < c > d');
  });

  it('decodes numeric entities', () => {
    expect(stripHtml('&#65;')).toBe('A');
  });

  it('collapses whitespace', () => {
    expect(stripHtml('hello   world\n\n\n\nmore')).toBe('hello world more');
  });

  it('removes script and style tags', () => {
    expect(stripHtml('<script>alert("x")</script><p>content</p>')).toBe('content');
  });

  it('handles empty input', () => {
    expect(stripHtml('')).toBe('');
  });

  it('handles plain text without tags', () => {
    expect(stripHtml('just plain text')).toBe('just plain text');
  });

  it('decodes &quot; entity', () => {
    expect(stripHtml('he said &quot;hello&quot;')).toBe('he said "hello"');
  });

  it('decodes &#39; entity', () => {
    expect(stripHtml('it&#39;s')).toBe("it's");
  });

  it('decodes &nbsp; entity', () => {
    const result = stripHtml('a&nbsp;b');
    expect(result).toBe('a\u00A0b');
  });

  it('handles nested tags', () => {
    expect(stripHtml('<div><span><strong>deep</strong></span></div>')).toBe('deep');
  });

  it('removes style tags', () => {
    expect(stripHtml('<style>.x{color:red}</style><p>text</p>')).toBe('text');
  });

  it('handles self-closing tags', () => {
    expect(stripHtml('line1<br/>line2<hr/>line3')).toContain('line1');
    expect(stripHtml('line1<br/>line2<hr/>line3')).toContain('line2');
  });

  it('handles attributes on tags', () => {
    expect(stripHtml('<a href="https://example.com">link</a>')).toBe('link');
  });
});

describe('extractJdFromText', () => {
  it('returns validated ExtractedJd', async () => {
    mockLlmResponse({
      location: 'Sydney',
      salary: '150k AUD',
      tags: ['typescript', 'node'],
    });

    const result = await extractJdFromText('Job posting text...', testLlmConfig);

    expect(result.title).toBe('Software Engineer');
    expect(result.company).toBe('Test Corp');
    expect(result.location).toBe('Sydney');
    expect(result.salary).toBe('150k AUD');
    expect(result.tags).toEqual(['typescript', 'node']);
  });

  it('handles partial JD (title + company only)', async () => {
    mockLlmResponse({});

    const result = await extractJdFromText('Short JD...', testLlmConfig);

    expect(result.title).toBe('Software Engineer');
    expect(result.company).toBe('Test Corp');
    expect(result.location).toBeUndefined();
    expect(result.salary).toBeUndefined();
  });

  it('sends system prompt and JD text as separate messages', async () => {
    mockLlmResponse({});

    await extractJdFromText('My job text', testLlmConfig);

    const [messages] = mockChatComplete.mock.calls[0] as [Array<{ role: string; content: string }>];
    const systemMsg = messages.find((m) => m.role === 'system');
    const userMsg = messages.find((m) => m.role === 'user' && m.content === 'My job text');
    expect(systemMsg).toBeDefined();
    expect(systemMsg!.content).not.toContain('{{TEXT}}');
    expect(userMsg).toBeDefined();
  });

  it('uses jsonMode and temperature 0.1', async () => {
    mockLlmResponse({});

    await extractJdFromText('text', testLlmConfig);

    const [, , options] = mockChatComplete.mock.calls[0] as [
      unknown,
      unknown,
      Record<string, unknown>,
    ];
    expect(options.jsonMode).toBe(true);
    expect(options.temperature).toBe(0.1);
  });

  it('retries on validation failure then succeeds', async () => {
    mockChatComplete
      .mockResolvedValueOnce({
        content: JSON.stringify({ title: '', company: '' }),
        model: 'gpt-4o',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        durationMs: 200,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ title: 'Real Title', company: 'Real Corp' }),
        model: 'gpt-4o',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        durationMs: 200,
      });

    const result = await extractJdFromText('text', testLlmConfig);

    expect(result.title).toBe('Real Title');
    expect(result.company).toBe('Real Corp');
    expect(mockChatComplete).toHaveBeenCalledTimes(2);
  });

  it('throws after 3 failures', async () => {
    const badResponse = {
      content: JSON.stringify({ title: '', company: '' }),
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    };
    mockChatComplete
      .mockResolvedValueOnce(badResponse)
      .mockResolvedValueOnce(badResponse)
      .mockResolvedValueOnce(badResponse);

    await expect(extractJdFromText('text', testLlmConfig)).rejects.toThrow(
      /JD extraction failed after 3 attempts/,
    );
    expect(mockChatComplete).toHaveBeenCalledTimes(3);
  });

  it('includes retry message in follow-up calls', async () => {
    mockChatComplete
      .mockResolvedValueOnce({
        content: JSON.stringify({ title: '', company: '' }),
        model: 'gpt-4o',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        durationMs: 200,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ title: 'Fixed', company: 'Corp' }),
        model: 'gpt-4o',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        durationMs: 200,
      });

    await extractJdFromText('text', testLlmConfig);

    const [secondMessages] = mockChatComplete.mock.calls[1] as [
      Array<{ role: string; content: string }>,
    ];
    const retryMsg = secondMessages.find(
      (m) => m.role === 'user' && m.content.includes('failed validation'),
    );
    expect(retryMsg).toBeDefined();
  });

  it('handles non-Error throw during validation', async () => {
    mockChatComplete
      .mockResolvedValueOnce({
        content: 'not json at all',
        model: 'gpt-4o',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        durationMs: 200,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ title: 'Fixed', company: 'Corp' }),
        model: 'gpt-4o',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        durationMs: 200,
      });

    const result = await extractJdFromText('text', testLlmConfig);

    expect(result.title).toBe('Fixed');
    expect(result.company).toBe('Corp');
    expect(mockChatComplete).toHaveBeenCalledTimes(2);
  });

  it('passes llmConfig through to chatComplete', async () => {
    mockLlmResponse({});

    await extractJdFromText('text', testLlmConfig);

    const [, config] = mockChatComplete.mock.calls[0] as [unknown, LlmConfig];
    expect(config.baseUrl).toBe('https://api.test.com/v1');
    expect(config.apiKey).toBe('sk-test');
    expect(config.model).toBe('gpt-4o');
  });

  it('passes logger through to chatComplete', async () => {
    mockLlmResponse({});
    const log = { debug: vi.fn(), warn: vi.fn() } as unknown as Logger;

    await extractJdFromText('text', testLlmConfig, log);

    expect(log.debug).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 0, textLength: 4 }),
      'extract.start',
    );
    expect(log.debug).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Software Engineer', company: 'Test Corp' }),
      'extract.complete',
    );
  });

  it('logs warning on each validation failure', async () => {
    mockChatComplete
      .mockResolvedValueOnce({
        content: JSON.stringify({ title: '', company: '' }),
        model: 'gpt-4o',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        durationMs: 200,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ title: 'Fixed', company: 'Corp' }),
        model: 'gpt-4o',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        durationMs: 200,
      });
    const log = { debug: vi.fn(), warn: vi.fn() } as unknown as Logger;

    await extractJdFromText('text', testLlmConfig, log);

    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 0 }),
      'extract.validation_failed',
    );
  });

  it('returns all optional fields when present', async () => {
    mockLlmResponse({
      location: 'Sydney NSW',
      salary: '160k-180k AUD',
      tags: ['typescript', 'react', 'aws'],
      description: 'A great role at a great company.',
      requirements: ['5+ years experience', 'TypeScript'],
      qualifications: ['CS degree', 'AWS certification'],
      benefits: ['Health insurance', 'Remote work'],
      employmentType: 'full-time',
      seniorityLevel: 'senior',
    });

    const result = await extractJdFromText('JD text', testLlmConfig);

    expect(result.location).toBe('Sydney NSW');
    expect(result.salary).toBe('160k-180k AUD');
    expect(result.tags).toEqual(['typescript', 'react', 'aws']);
    expect(result.description).toBe('A great role at a great company.');
    expect(result.requirements).toEqual(['5+ years experience', 'TypeScript']);
    expect(result.qualifications).toEqual(['CS degree', 'AWS certification']);
    expect(result.benefits).toEqual(['Health insurance', 'Remote work']);
    expect(result.employmentType).toBe('full-time');
    expect(result.seniorityLevel).toBe('senior');
  });

  it('wraps non-Error throw as Error', async () => {
    mockChatComplete.mockResolvedValueOnce({
      content: '{"title":"x","company":"y"}',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    });
    const spy = vi.spyOn(llmModule, 'parseJsonResult').mockImplementationOnce(() => {
      throw 'string error';
    });

    await expect(extractJdFromText('text', testLlmConfig)).rejects.toThrow(
      /JD extraction failed after 3 attempts/,
    );
    spy.mockRestore();
  });

  it('logs error when logger provided and all retries fail', async () => {
    const badResponse = {
      content: JSON.stringify({ title: '', company: '' }),
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    };
    mockChatComplete
      .mockResolvedValueOnce(badResponse)
      .mockResolvedValueOnce(badResponse)
      .mockResolvedValueOnce(badResponse);
    const log = { debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as Logger;

    await expect(extractJdFromText('text', testLlmConfig, log)).rejects.toThrow(
      /JD extraction failed after 3 attempts/,
    );
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: 3 }),
      'extract.failed',
    );
  });
});

describe('extractJdFromUrl', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches, strips HTML, and extracts', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(mockFetchResponse('<h1>Software Engineer</h1><p>At Test Corp</p>'));
    mockLlmResponse({ location: 'Remote' });

    const result = await extractJdFromUrl('https://example.com/job/123', testLlmConfig);

    expect(result.title).toBe('Software Engineer');
    expect(result.company).toBe('Test Corp');
    expect(result.location).toBe('Remote');
  });

  it('throws on fetch failure', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(extractJdFromUrl('https://example.com/job/123', testLlmConfig)).rejects.toThrow(
      'fetch failed',
    );
  });

  it('strips HTML before sending to LLM', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(
      mockFetchResponse('<div><p>Engineer</p><br><span>at Corp</span></div>'),
    );
    mockLlmResponse({});

    await extractJdFromUrl('https://example.com/job/123', testLlmConfig);

    const [messages] = mockChatComplete.mock.calls[0] as [Array<{ role: string; content: string }>];
    const userMsg = messages.find((m) => m.role === 'user');
    expect(userMsg!.content).not.toContain('<div>');
    expect(userMsg!.content).not.toContain('<p>');
    expect(userMsg!.content).toContain('Engineer');
  });

  it('throws when LLM extraction fails after fetch', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(mockFetchResponse('<p>JD</p>'));
    const badResponse = {
      content: JSON.stringify({ title: '', company: '' }),
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      durationMs: 200,
    };
    mockChatComplete
      .mockResolvedValueOnce(badResponse)
      .mockResolvedValueOnce(badResponse)
      .mockResolvedValueOnce(badResponse);

    await expect(extractJdFromUrl('https://example.com/job/123', testLlmConfig)).rejects.toThrow(
      /JD extraction failed/,
    );
  });

  it('passes logger through entire pipeline', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValueOnce(mockFetchResponse('<p>Engineer at Corp</p>'));
    mockLlmResponse({});
    const log = { debug: vi.fn(), warn: vi.fn() } as unknown as Logger;

    await extractJdFromUrl('https://example.com/job/123', testLlmConfig, log);

    expect(log.debug).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/job/123' }),
      'fetch.start',
    );
    expect(log.debug).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Software Engineer' }),
      'extract.complete',
    );
  });
});
