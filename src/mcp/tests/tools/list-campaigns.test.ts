import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import { runListCampaigns } from '../../../core/list/list.js';
import { registerListCampaigns } from '../../tools/list-campaigns.js';
import { createStore } from '../../../storage/index.js';

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
  ListCampaignsInput: z.object({}),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/list/list.js', () => ({
  runListCampaigns: vi.fn(),
  runListApplications: vi.fn(),
}));

describe('list_campaigns tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns campaign list', async () => {
    vi.mocked(runListCampaigns).mockResolvedValue({
      campaigns: [{ name: 'default', applicationCount: 0 }],
    });

    const { client } = await createTestServer((srv) => registerListCampaigns(srv, createStore()));

    const result = await client.callTool({ name: 'list_campaigns', arguments: {} });
    const data = JSON.parse(getTextContent(result));
    expect(data.campaigns).toHaveLength(1);
    expect(data.campaigns[0].name).toBe('default');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(runListCampaigns).mockImplementation(() => {
      throw new Error('test error');
    });

    const { client } = await createTestServer((srv) => registerListCampaigns(srv, createStore()));

    const result = await client.callTool({ name: 'list_campaigns', arguments: {} });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('test error');
  });
});
