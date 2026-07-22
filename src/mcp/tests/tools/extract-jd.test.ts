import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';
import { extractJdFromUrl, extractJdFromText } from '../../../core/jobs/extract.js';
import { registerExtractJd } from '../../tools/extract-jd.js';

vi.mock('../../../core/logger/logger.js', () => ({
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../error-handler.js', () => ({
  handleToolError: vi.fn((err: unknown) => ({
    content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
    isError: true as const,
  })),
}));

vi.mock('../../schemas.js', async () => {
  const { z } = await import('zod');
  const CampaignParam = z.string();
  return {
    ExtractJdInput: z.object({
      campaign: CampaignParam,
      url: z.string().url().optional().describe('Job posting URL'),
      text: z.string().optional().describe('Raw job description text'),
    }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/config/config.js', () => ({
  getConfig: vi.fn(() => ({
    global: {
      llm: { baseUrl: 'http://localhost:11434', apiKey: 'key', model: 'gpt-4', timeoutMs: 120000 },
    },
    campaign: {},
  })),
}));

vi.mock('../../../core/llm.js', () => ({
  defaultLlmConfig: vi.fn(() => ({
    baseUrl: 'http://localhost:11434',
    apiKey: 'key',
    model: 'gpt-4',
    timeoutMs: 120000,
  })),
}));

vi.mock('../../../core/jobs/extract.js', () => ({
  extractJdFromUrl: vi.fn().mockResolvedValue({
    title: 'Senior Engineer',
    company: 'Acme Corp',
    location: 'Remote',
    description: 'Job description text',
  }),
  extractJdFromText: vi.fn().mockResolvedValue({
    title: 'Senior Engineer',
    company: 'Acme Corp',
    location: 'Remote',
    description: 'Job description text',
  }),
}));

describe('extract_jd tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts JD from URL', async () => {
    vi.mocked(extractJdFromUrl).mockResolvedValue({
      title: 'Senior Engineer',
      company: 'Acme Corp',
      location: 'Remote',
      description: 'Job description text',
    });

    const { server, getCallback } = fakeServer();
    registerExtractJd(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', url: 'https://example.com/job/123' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(extractJdFromUrl).toHaveBeenCalledWith('https://example.com/job/123', {
      baseUrl: 'http://localhost:11434',
      apiKey: 'key',
      model: 'gpt-4',
      timeoutMs: 120000,
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.title).toBe('Senior Engineer');
    expect(parsed.company).toBe('Acme Corp');
  });

  it('extracts JD from text', async () => {
    vi.mocked(extractJdFromText).mockResolvedValue({
      title: 'Junior Developer',
      company: 'Beta LLC',
      description: 'Raw text description',
    });

    const { server, getCallback } = fakeServer();
    registerExtractJd(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', text: 'We are looking for a Junior Developer...' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(extractJdFromText).toHaveBeenCalledWith('We are looking for a Junior Developer...', {
      baseUrl: 'http://localhost:11434',
      apiKey: 'key',
      model: 'gpt-4',
      timeoutMs: 120000,
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.title).toBe('Junior Developer');
  });

  it('returns error when neither url nor text is provided', async () => {
    const { server, getCallback } = fakeServer();
    registerExtractJd(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('Either url or text must be provided');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(extractJdFromUrl).mockRejectedValue(new Error('Failed to fetch URL'));

    const { server, getCallback } = fakeServer();
    registerExtractJd(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', url: 'https://example.com/job/123' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('Failed to fetch URL');
  });
});
