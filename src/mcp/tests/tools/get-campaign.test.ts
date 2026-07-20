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
    GetCampaignInput: z.object({ campaign: z.string() }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/config/config.js', async () => ({
  loadCampaignConfig: vi.fn(),
}));

vi.mock('../../../core/config/config.view.js', async () => ({
  redactSecrets: vi.fn((c: unknown) => c),
}));

describe('get_campaign tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns redacted campaign config', async () => {
    const { loadCampaignConfig } = await import('../../../core/config/config.js');
    vi.mocked(loadCampaignConfig).mockReturnValue({
      version: 1,
      profile: '/data/campaigns/default/profile.md',
      applied: '/data/campaigns/default/applied',
    } as never);

    const { registerGetCampaign } = await import('../../tools/get-campaign.js');
    const { server, getCallback } = fakeServer();
    registerGetCampaign(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    const data = JSON.parse(getTextContent(result));
    expect(data.version).toBe(1);
  });

  it('returns error when core function fails', async () => {
    const { loadCampaignConfig } = await import('../../../core/config/config.js');
    vi.mocked(loadCampaignConfig).mockImplementation(() => {
      throw new Error('test error');
    });

    const { registerGetCampaign } = await import('../../tools/get-campaign.js');
    const { server, getCallback } = fakeServer();
    registerGetCampaign(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('test error');
  });
});
