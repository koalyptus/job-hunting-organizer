import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';

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
  const SlugParam = z.string();
  return {
    AppendRetroInput: z.object({
      campaign: CampaignParam,
      slug: SlugParam,
      weakTopics: z.array(z.string()).optional(),
      notes: z.string().optional(),
      steer: z.string().optional(),
      status: z.string().optional(),
      noCarryOver: z.boolean().optional(),
    }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/retro/retro.js', async () => ({
  appendRetro: vi.fn().mockResolvedValue({
    content: '# New Section\nMore study.',
    wordCount: 8,
    model: 'gpt-4',
    durationMs: 3000,
    index: 2,
  }),
}));

describe('append_retro tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('appends weak topics to existing retro', async () => {
    const { appendRetro } = await import('../../../core/retro/retro.js');
    vi.mocked(appendRetro).mockResolvedValue({
      content: '# New Section\nMore study.',
      wordCount: 8,
      model: 'gpt-4',
      durationMs: 3000,
      index: 2,
    });

    const { registerAppendRetro } = await import('../../tools/append-retro-tool.js');
    const { server, getCallback } = fakeServer();
    registerAppendRetro(server);
    const cb = getCallback()!;

    const result = await cb(
      {
        campaign: 'default',
        slug: 'test-app',
        weakTopics: ['behavioral'],
        notes: 'Need more practice',
        noCarryOver: true,
      },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(appendRetro).toHaveBeenCalledWith({
      slug: 'test-app',
      campaign: 'default',
      weakTopics: ['behavioral'],
      notes: 'Need more practice',
      steer: undefined,
      status: undefined,
      noCarryOver: true,
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.content).toContain('New Section');
    expect(parsed.index).toBe(2);
  });

  it('appends with undefined weak topics (defaults to empty)', async () => {
    const { appendRetro } = await import('../../../core/retro/retro.js');
    vi.mocked(appendRetro).mockResolvedValue({
      content: '# Empty',
      wordCount: 1,
      model: 'gpt-4',
      durationMs: 500,
      index: 3,
    });

    const { registerAppendRetro } = await import('../../tools/append-retro-tool.js');
    const { server, getCallback } = fakeServer();
    registerAppendRetro(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'test-app' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(appendRetro).toHaveBeenCalledWith({
      slug: 'test-app',
      campaign: 'default',
      weakTopics: [],
      notes: undefined,
      steer: undefined,
      status: undefined,
      noCarryOver: undefined,
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.index).toBe(3);
  });

  it('returns error when core function fails', async () => {
    const { appendRetro } = await import('../../../core/retro/retro.js');
    vi.mocked(appendRetro).mockRejectedValue(new Error('at least one new weak topic is required'));

    const { registerAppendRetro } = await import('../../tools/append-retro-tool.js');
    const { server, getCallback } = fakeServer();
    registerAppendRetro(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'test-app', weakTopics: [] },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('at least one new weak topic is required');
  });
});
