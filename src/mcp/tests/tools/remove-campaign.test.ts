import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { fakeServer, getTextContent } from './helpers.js';
import { registerRemoveCampaign } from '../../tools/remove-campaign.js';
import { removeCampaign } from '../../../core/campaign/remove-campaign.js';

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
  RemoveCampaignInput: z.object({
    campaign: z.string(),
    confirm: z.boolean().optional(),
  }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/campaign/remove-campaign.js', () => ({
  removeCampaign: vi.fn().mockResolvedValue(undefined),
  RemoveCampaignError: class extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'RemoveCampaignError';
    }
  },
  RemoveCancelled: class extends Error {
    reason: string;
    constructor(reason = 'cancelled') {
      super(reason);
      this.name = 'RemoveCancelled';
      this.reason = reason;
    }
  },
}));

describe('remove_campaign tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes a campaign successfully', async () => {
    const { server, getCallback } = fakeServer();
    registerRemoveCampaign(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'test-campaign' }, { signal: AbortSignal.timeout(3000) });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.campaign).toBe('test-campaign');
    expect(parsed.removed).toBe(true);
  });

  it('returns error when core function fails', async () => {
    vi.mocked(removeCampaign).mockRejectedValue(new Error('campaign not found'));

    const { server, getCallback } = fakeServer();
    registerRemoveCampaign(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'nonexistent' }, { signal: AbortSignal.timeout(3000) });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('campaign not found');
  });
});
