import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import { startRetro } from '../../../core/retro/retro.js';
import { registerPostMortem } from '../../tools/post-mortem.js';

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

vi.mock('../../schemas.js', () => {
  const CampaignParam = z.string();
  const SlugParam = z.string();
  return {
    PostMortemInput: z.object({
      campaign: CampaignParam,
      slug: SlugParam,
      weakTopics: z.array(z.string()).optional(),
      notes: z.string().optional(),
      steer: z.string().optional(),
      status: z.string().optional(),
    }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/retro/retro.js', () => ({
  startRetro: vi.fn().mockResolvedValue({
    content: '# Learning Plan\nStudy X.',
    wordCount: 10,
    model: 'gpt-4',
    durationMs: 5000,
    index: 1,
  }),
}));

describe('post_mortem tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates a retro learning plan with explicit weak topics', async () => {
    vi.mocked(startRetro).mockResolvedValue({
      content: '# Learning Plan\nStudy X.',
      wordCount: 10,
      model: 'gpt-4',
      durationMs: 5000,
      index: 1,
    });

    const { server, getCallback } = fakeServer();
    registerPostMortem(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'test-app', weakTopics: ['algorithms', 'system-design'] },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(startRetro).toHaveBeenCalledWith({
      slug: 'test-app',
      campaign: 'default',
      weakTopics: ['algorithms', 'system-design'],
      notes: undefined,
      steer: undefined,
      status: undefined,
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.content).toContain('Learning Plan');
    expect(parsed.index).toBe(1);
  });

  it('generates retro with undefined weak topics (defaults to empty array)', async () => {
    vi.mocked(startRetro).mockResolvedValue({
      content: '# Empty Plan',
      wordCount: 2,
      model: 'gpt-4',
      durationMs: 1000,
      index: 1,
    });

    const { server, getCallback } = fakeServer();
    registerPostMortem(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'test-app' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(startRetro).toHaveBeenCalledWith({
      slug: 'test-app',
      campaign: 'default',
      weakTopics: [],
      notes: undefined,
      steer: undefined,
      status: undefined,
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.content).toContain('Empty Plan');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(startRetro).mockRejectedValue(new Error('at least one weak topic is required'));

    const { server, getCallback } = fakeServer();
    registerPostMortem(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'test-app', weakTopics: [] },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('at least one weak topic is required');
  });
});
