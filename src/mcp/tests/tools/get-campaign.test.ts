import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import { loadCampaignConfig } from '../../../core/config/config.js';
import { registerGetCampaign } from '../../tools/get-campaign.js';

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

vi.mock('../../schemas.js', () => ({
  GetCampaignInput: z.object({ campaign: z.string() }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/config/config.js', () => ({
  loadCampaignConfig: vi.fn(),
}));

vi.mock('../../../core/config/config.view.js', () => ({
  redactSecrets: vi.fn((c: unknown) => c),
}));

describe('get_campaign tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns redacted campaign config', async () => {
    vi.mocked(loadCampaignConfig).mockReturnValue({
      version: 1,
      profile: '/data/campaigns/default/profile.md',
      applied: '/data/campaigns/default/applied',
    } as never);

    const { server, getCallback } = fakeServer();
    registerGetCampaign(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    const data = JSON.parse(getTextContent(result));
    expect(data.version).toBe(1);
  });

  it('returns error when core function fails', async () => {
    vi.mocked(loadCampaignConfig).mockImplementation(() => {
      throw new Error('test error');
    });

    const { server, getCallback } = fakeServer();
    registerGetCampaign(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('test error');
  });
});
