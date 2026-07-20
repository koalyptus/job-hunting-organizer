import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';

vi.mock('../../../core/logger/logger.js', () => ({
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../core/paths.js', async () => ({
  resolveCampaignRoot: vi.fn(),
  resolveAppliedDir: vi.fn(),
  resolveDataRoot: vi.fn(),
  resolveConfigHome: vi.fn(),
}));

vi.mock('../../error-handler.js', () => ({
  handleToolError: vi.fn((err: unknown) => ({
    content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
    isError: true as const,
  })),
}));

vi.mock('../../schemas.js', async () => {
  const { z } = await import('zod');
  const { EMPLOYMENT_TYPES } = await import('../../../core/applications/types.js');
  return {
    GetStatsInput: z.object({
      campaign: z.string(),
      targetRole: z.string().optional(),
      since: z.string().optional(),
      employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
    }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/stats/stats.js', async () => ({
  computeStats: vi.fn(),
}));

describe('get_stats tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns stats object', async () => {
    const { resolveCampaignRoot, resolveAppliedDir } = await import('../../../core/paths.js');
    const { computeStats } = await import('../../../core/stats/stats.js');
    vi.mocked(resolveCampaignRoot).mockReturnValue('/data/campaigns/default');
    vi.mocked(resolveAppliedDir).mockReturnValue('/data/campaigns/default/applied');
    vi.mocked(computeStats).mockResolvedValue({
      total: 5,
      byStatus: {
        applied: 3,
        interview: 1,
        offer: 1,
        rejected: 0,
        withdrawn: 0,
        abandoned: 0,
        ghosted: 0,
        accepted: 0,
      },
      byRole: {},
      bySite: {},
      byEmploymentType: {},
      funnel: { applied: 3, interview: 1, offer: 1, accepted: 0 },
      thisMonth: { applied: 2, rejected: 0, offer: 0, withdrawn: 0 },
    });

    const { registerGetStats } = await import('../../tools/get-stats.js');
    const { server, getCallback } = fakeServer();
    registerGetStats(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    const data = JSON.parse(getTextContent(result));
    expect(data.total).toBe(5);
  });

  it('returns error when core function fails', async () => {
    const { resolveCampaignRoot, resolveAppliedDir } = await import('../../../core/paths.js');
    const { computeStats } = await import('../../../core/stats/stats.js');
    vi.mocked(resolveCampaignRoot).mockReturnValue('/data/campaigns/default');
    vi.mocked(resolveAppliedDir).mockReturnValue('/data/campaigns/default/applied');
    vi.mocked(computeStats).mockImplementation(() => {
      throw new Error('test error');
    });

    const { registerGetStats } = await import('../../tools/get-stats.js');
    const { server, getCallback } = fakeServer();
    registerGetStats(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('test error');
  });
});
