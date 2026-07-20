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
  return {
    ListCampaignsInput: z.object({}),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/list/list.js', async () => ({
  runListCampaigns: vi.fn(),
  runListApplications: vi.fn(),
}));

describe('list_campaigns tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns campaign list', async () => {
    const { runListCampaigns } = await import('../../../core/list/list.js');
    vi.mocked(runListCampaigns).mockResolvedValue({
      campaigns: [{ name: 'default', applicationCount: 0 }],
    });

    const { registerListCampaigns } = await import('../../tools/list-campaigns.js');
    const { server, getCallback } = fakeServer();
    registerListCampaigns(server);
    const cb = getCallback()!;

    const result = await cb({}, { signal: AbortSignal.timeout(3000) });
    const data = JSON.parse(getTextContent(result));
    expect(data.campaigns).toHaveLength(1);
    expect(data.campaigns[0].name).toBe('default');
  });

  it('returns error when core function fails', async () => {
    const { runListCampaigns } = await import('../../../core/list/list.js');
    vi.mocked(runListCampaigns).mockImplementation(() => {
      throw new Error('test error');
    });

    const { registerListCampaigns } = await import('../../tools/list-campaigns.js');
    const { server, getCallback } = fakeServer();
    registerListCampaigns(server);
    const cb = getCallback()!;

    const result = await cb({}, { signal: AbortSignal.timeout(3000) });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('test error');
  });
});
