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
    CoverLetterInput: z.object({
      campaign: CampaignParam,
      slug: SlugParam,
      steer: z.string().optional().describe('Custom LLM instructions'),
    }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/applications/cover-letter.js', async () => ({
  generateCoverLetter: vi.fn().mockResolvedValue({
    content: '# Cover Letter\nDear Hiring Manager...',
    wordCount: 42,
    model: 'gpt-4',
    durationMs: 5000,
  }),
}));

describe('cover_letter tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates a cover letter with explicit steer', async () => {
    const { generateCoverLetter } = await import('../../../core/applications/cover-letter.js');
    vi.mocked(generateCoverLetter).mockResolvedValue({
      content: '# Cover Letter\nDear Hiring Manager...',
      wordCount: 42,
      model: 'gpt-4',
      durationMs: 5000,
    });

    const { registerCoverLetter } = await import('../../tools/cover-letter.js');
    const { server, getCallback } = fakeServer();
    registerCoverLetter(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'test-app', steer: 'Be concise' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(generateCoverLetter).toHaveBeenCalledWith({
      slug: 'test-app',
      campaign: 'default',
      steer: 'Be concise',
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.content).toContain('Cover Letter');
    expect(parsed.wordCount).toBe(42);
  });

  it('generates cover letter with undefined steer (defaults)', async () => {
    const { generateCoverLetter } = await import('../../../core/applications/cover-letter.js');
    vi.mocked(generateCoverLetter).mockResolvedValue({
      content: '# Cover Letter\nDefault steer.',
      wordCount: 10,
      model: 'gpt-4',
      durationMs: 3000,
    });

    const { registerCoverLetter } = await import('../../tools/cover-letter.js');
    const { server, getCallback } = fakeServer();
    registerCoverLetter(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'test-app' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(generateCoverLetter).toHaveBeenCalledWith({
      slug: 'test-app',
      campaign: 'default',
      steer: undefined,
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.content).toContain('Default steer');
  });

  it('returns error when core function fails', async () => {
    const { generateCoverLetter } = await import('../../../core/applications/cover-letter.js');
    vi.mocked(generateCoverLetter).mockRejectedValue(new Error('Failed to read JD'));

    const { registerCoverLetter } = await import('../../tools/cover-letter.js');
    const { server, getCallback } = fakeServer();
    registerCoverLetter(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'test-app' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('Failed to read JD');
  });
});
