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
    PrepareInput: z.object({
      campaign: CampaignParam,
      slug: SlugParam,
      steer: z.string().optional().describe('Custom LLM instructions'),
      days: z.number().int().positive().optional().describe('Days until interview'),
    }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/prepare/prepare.js', async () => ({
  generatePrep: vi.fn().mockResolvedValue({
    content: '# Prep plan\nStudy algorithms.',
    wordCount: 20,
    model: 'gpt-4',
    durationMs: 6000,
  }),
}));

describe('prepare tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates a prep plan with explicit days and steer', async () => {
    const { generatePrep } = await import('../../../core/prepare/prepare.js');
    vi.mocked(generatePrep).mockResolvedValue({
      content: '# Prep plan\nStudy algorithms.',
      wordCount: 20,
      model: 'gpt-4',
      durationMs: 6000,
    });

    const { registerPrepare } = await import('../../tools/prepare-tool.js');
    const { server, getCallback } = fakeServer();
    registerPrepare(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'test-app', days: 14, steer: 'Focus on system design' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(generatePrep).toHaveBeenCalledWith({
      slug: 'test-app',
      campaign: 'default',
      steer: 'Focus on system design',
      days: 14,
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.content).toContain('Prep plan');
    expect(parsed.wordCount).toBe(20);
  });

  it('generates prep plan with undefined days and steer (defaults)', async () => {
    const { generatePrep } = await import('../../../core/prepare/prepare.js');
    vi.mocked(generatePrep).mockResolvedValue({
      content: '# Prep plan\nDefault plan.',
      wordCount: 5,
      model: 'gpt-4',
      durationMs: 3000,
    });

    const { registerPrepare } = await import('../../tools/prepare-tool.js');
    const { server, getCallback } = fakeServer();
    registerPrepare(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'test-app' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(generatePrep).toHaveBeenCalledWith({
      slug: 'test-app',
      campaign: 'default',
      steer: undefined,
      days: undefined,
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.content).toContain('Default plan');
  });

  it('returns error when core function fails', async () => {
    const { generatePrep } = await import('../../../core/prepare/prepare.js');
    vi.mocked(generatePrep).mockRejectedValue(new Error('Failed to read JD'));

    const { registerPrepare } = await import('../../tools/prepare-tool.js');
    const { server, getCallback } = fakeServer();
    registerPrepare(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'test-app' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('Failed to read JD');
  });
});
