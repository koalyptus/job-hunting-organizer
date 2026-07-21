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
  const { INTERVIEW_STATUSES } = await import('../../../core/interviews/types.js');
  const CampaignParam = z.string();
  const SlugParam = z.string();
  return {
    MarkInterviewInput: z.object({
      campaign: CampaignParam,
      slug: SlugParam,
      index: z.number().int().nonnegative(),
      status: z.enum(INTERVIEW_STATUSES),
      notes: z.string().optional(),
    }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/interviews/interviews.js', async () => ({
  markInterviewStatus: vi.fn().mockResolvedValue(true),
  appendInterviewNotes: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../core/paths.js', () => ({
  resolveCampaignRoot: vi.fn((name: string) => `/campaigns/${name}`),
  resolveAppliedDir: vi.fn((root: string) => `${root}/applied`),
}));

describe('mark_interview tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks an interview status with 0-based to 1-based index conversion', async () => {
    const { markInterviewStatus } = await import('../../../core/interviews/interviews.js');
    vi.mocked(markInterviewStatus).mockResolvedValue(true);

    const { registerMarkInterview } = await import('../../tools/mark-interview.js');
    const { server, getCallback } = fakeServer();
    registerMarkInterview(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'test-app', index: 0, status: 'completed' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(markInterviewStatus).toHaveBeenCalledWith('/campaigns/default/applied', 'test-app', {
      sectionNumber: 1,
      status: 'completed',
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.success).toBe(true);
  });

  it('appends notes when notes are provided', async () => {
    const { markInterviewStatus, appendInterviewNotes } =
      await import('../../../core/interviews/interviews.js');
    vi.mocked(markInterviewStatus).mockResolvedValue(true);
    vi.mocked(appendInterviewNotes).mockResolvedValue(true);

    const { registerMarkInterview } = await import('../../tools/mark-interview.js');
    const { server, getCallback } = fakeServer();
    registerMarkInterview(server);
    const cb = getCallback()!;

    const result = await cb(
      {
        campaign: 'default',
        slug: 'test-app',
        index: 1,
        status: 'completed',
        notes: 'Great technical discussion',
      },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(markInterviewStatus).toHaveBeenCalledWith('/campaigns/default/applied', 'test-app', {
      sectionNumber: 2,
      status: 'completed',
    });
    expect(appendInterviewNotes).toHaveBeenCalledWith('/campaigns/default/applied', 'test-app', {
      sectionNumber: 2,
      notes: 'Great technical discussion',
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.success).toBe(true);
  });

  it('skips notes append when notes are not provided', async () => {
    const { markInterviewStatus, appendInterviewNotes } =
      await import('../../../core/interviews/interviews.js');
    vi.mocked(markInterviewStatus).mockResolvedValue(true);
    vi.mocked(appendInterviewNotes).mockResolvedValue(true);

    const { registerMarkInterview } = await import('../../tools/mark-interview.js');
    const { server, getCallback } = fakeServer();
    registerMarkInterview(server);
    const cb = getCallback()!;

    await cb(
      { campaign: 'default', slug: 'test-app', index: 0, status: 'pending' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(appendInterviewNotes).not.toHaveBeenCalled();
  });

  it('returns error when appendInterviewNotes fails', async () => {
    const { markInterviewStatus, appendInterviewNotes } =
      await import('../../../core/interviews/interviews.js');
    vi.mocked(markInterviewStatus).mockResolvedValue(true);
    vi.mocked(appendInterviewNotes).mockRejectedValue(new Error('interviews.md not found'));

    const { registerMarkInterview } = await import('../../tools/mark-interview.js');
    const { server, getCallback } = fakeServer();
    registerMarkInterview(server);
    const cb = getCallback()!;

    const result = await cb(
      {
        campaign: 'default',
        slug: 'test-app',
        index: 0,
        status: 'completed',
        notes: 'Some notes',
      },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('interviews.md not found');
  });

  it('returns error when core function fails', async () => {
    const { markInterviewStatus } = await import('../../../core/interviews/interviews.js');
    vi.mocked(markInterviewStatus).mockRejectedValue(new Error('interview not found'));

    const { registerMarkInterview } = await import('../../tools/mark-interview.js');
    const { server, getCallback } = fakeServer();
    registerMarkInterview(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'test-app', index: 2, status: 'completed' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('interview not found');
  });
});
