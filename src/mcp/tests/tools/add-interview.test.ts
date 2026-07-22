import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import { INTERVIEW_TYPES } from '../../../core/interviews/types.js';
import { addInterview } from '../../../core/interviews/interviews.js';
import { registerAddInterview } from '../../tools/add-interview.js';

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
    AddInterviewInput: z.object({
      campaign: CampaignParam,
      slug: SlugParam,
      when: z.string(),
      title: z.string().optional(),
      type: z.enum(INTERVIEW_TYPES).optional(),
      duration: z.number().int().positive().optional(),
      interviewers: z.array(z.string()).optional(),
      location: z.string().optional(),
    }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/interviews/interviews.js', () => ({
  addInterview: vi.fn().mockResolvedValue({ index: 1 }),
}));

vi.mock('../../../core/paths.js', () => ({
  resolveCampaignRoot: vi.fn((name: string) => `/campaigns/${name}`),
  resolveAppliedDir: vi.fn((root: string) => `${root}/applied`),
}));

describe('add_interview tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds an interview and returns the index', async () => {
    vi.mocked(addInterview).mockResolvedValue({ index: 3 });

    const { server, getCallback } = fakeServer();
    registerAddInterview(server);
    const cb = getCallback()!;

    const result = await cb(
      {
        campaign: 'default',
        slug: 'test-app',
        when: '2026-07-21 14:00',
        type: 'technical',
        interviewers: ['Alice', 'Bob'],
      },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(addInterview).toHaveBeenCalledWith(
      '/campaigns/default/applied',
      'test-app',
      expect.objectContaining({
        when: '2026-07-21 14:00',
        type: 'technical',
        interviewers: 'Alice, Bob',
      }),
    );
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.index).toBe(3);
  });

  it('returns error when core function fails', async () => {
    vi.mocked(addInterview).mockRejectedValue(new Error('application not found'));

    const { server, getCallback } = fakeServer();
    registerAddInterview(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'missing', when: '2026-07-21 14:00' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('application not found');
  });
});
