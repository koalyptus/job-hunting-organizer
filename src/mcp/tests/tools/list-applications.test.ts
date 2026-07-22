import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import { APPLICATION_STATUSES, EMPLOYMENT_TYPES } from '../../../core/applications/types.js';
import { runListApplications } from '../../../core/list/list.js';
import { registerListApplications } from '../../tools/list-applications.js';

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
    ListApplicationsInput: z.object({
      campaign: CampaignParam,
      status: z.enum(APPLICATION_STATUSES).optional(),
      tags: z.array(z.string()).optional(),
      targetRole: z.string().optional(),
      employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
    }),
    ShowApplicationInput: z.object({ campaign: CampaignParam, slug: SlugParam }),
    ListInterviewsInput: z.object({ campaign: CampaignParam, slug: SlugParam }),
    ReadProfileInput: z.object({ campaign: CampaignParam }),
    GetStatsInput: z.object({
      campaign: CampaignParam,
      targetRole: z.string().optional(),
      since: z.string().optional(),
      employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
    }),
    GetRootInput: z.object({ campaign: CampaignParam }),
    GetCampaignInput: z.object({ campaign: CampaignParam }),
    ListCampaignsInput: z.object({}),
    OwnershipInput: z.object({}),
    DoctorInput: z.object({ campaign: CampaignParam, slug: SlugParam.optional() }),
    RepairInput: z.object({ campaign: CampaignParam, slug: SlugParam.optional() }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/list/list.js', () => ({
  runListApplications: vi.fn().mockResolvedValue({ entries: [] }),
}));

describe('list_applications tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns filtered entries', async () => {
    vi.mocked(runListApplications).mockResolvedValue({
      entries: [{ slug: 'test-app', status: 'applied' }] as never[],
    });

    const { server, getCallback } = fakeServer();
    registerListApplications(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    expect(result.content).toBeDefined();
    const text = getTextContent(result);
    expect(JSON.parse(text).entries).toHaveLength(1);
  });

  it('returns error when core function fails', async () => {
    vi.mocked(runListApplications).mockImplementation(() => {
      throw new Error('test error');
    });

    const { server, getCallback } = fakeServer();
    registerListApplications(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('test error');
  });
});
