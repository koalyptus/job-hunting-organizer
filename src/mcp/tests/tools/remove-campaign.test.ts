import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { createTestServer, getTextContent } from './helpers.js';
import { registerRemoveCampaign } from '../../tools/remove-campaign.js';
import { createStore } from '../../../storage/index.js';
import { removeCampaign } from '../../../core/campaign/remove-campaign.js';
import { mcpLogger } from '../../logger.js';

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
    const { client } = await createTestServer((srv) => registerRemoveCampaign(srv, createStore()));

    const result = await client.callTool({
      name: 'remove_campaign',
      arguments: { campaign: 'test-campaign' },
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.campaign).toBe('test-campaign');
    expect(parsed.removed).toBe(true);

    expect(vi.mocked(mcpLogger.debug)).toHaveBeenCalledWith(
      { campaign: 'test-campaign' },
      'tool.remove_campaign.start',
    );
    expect(vi.mocked(mcpLogger.debug)).toHaveBeenCalledWith(
      { campaign: 'test-campaign' },
      'tool.remove_campaign.done',
    );
  });

  it('passes confirm=true explicitly', async () => {
    const { client } = await createTestServer((srv) => registerRemoveCampaign(srv, createStore()));

    const result = await client.callTool({
      name: 'remove_campaign',
      arguments: { campaign: 'test-campaign', confirm: true },
    });
    expect(JSON.parse(getTextContent(result)).removed).toBe(true);
    expect(vi.mocked(removeCampaign)).toHaveBeenCalledWith('test-campaign', { skipConfirm: true });
  });

  it('passes confirm=false explicitly', async () => {
    const { client } = await createTestServer((srv) => registerRemoveCampaign(srv, createStore()));

    const result = await client.callTool({
      name: 'remove_campaign',
      arguments: { campaign: 'test-campaign', confirm: false },
    });
    expect(JSON.parse(getTextContent(result)).removed).toBe(true);
    expect(vi.mocked(removeCampaign)).toHaveBeenCalledWith('test-campaign', { skipConfirm: false });
  });

  it('returns error when core function fails', async () => {
    vi.mocked(removeCampaign).mockRejectedValue(new Error('campaign not found'));

    const { client } = await createTestServer((srv) => registerRemoveCampaign(srv, createStore()));

    const result = await client.callTool({
      name: 'remove_campaign',
      arguments: { campaign: 'nonexistent' },
    });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('campaign not found');
  });
});
