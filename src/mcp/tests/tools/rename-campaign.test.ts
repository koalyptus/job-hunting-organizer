import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { createTestServer, getTextContent } from './helpers.js';
import { registerRenameCampaign } from '../../tools/rename-campaign.js';
import { renameCampaign } from '../../../core/campaign/rename-campaign.js';

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
  RenameCampaignInput: z.object({
    from: z.string(),
    to: z.string(),
  }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/campaign/rename-campaign.js', () => ({
  renameCampaign: vi.fn().mockResolvedValue(undefined),
  RenameError: class extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'RenameError';
    }
  },
}));

describe('rename_campaign tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renames a campaign successfully', async () => {
    const { client } = await createTestServer(registerRenameCampaign);

    const result = await client.callTool({
      name: 'rename_campaign',
      arguments: { from: 'old-name', to: 'new-name' },
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.from).toBe('old-name');
    expect(parsed.to).toBe('new-name');
    expect(parsed.renamed).toBe(true);
  });

  it('returns error when core function fails', async () => {
    vi.mocked(renameCampaign).mockRejectedValue(new Error('rename failed'));

    const { client } = await createTestServer(registerRenameCampaign);

    const result = await client.callTool({
      name: 'rename_campaign',
      arguments: { from: 'old-name', to: 'new-name' },
    });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('rename failed');
  });
});
