import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { createTestServer, getTextContent } from './helpers.js';
import { registerReadCampaignConfig } from '../../tools/read-campaign-config.js';

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
  ReadCampaignConfigInput: z.object({
    campaign: z.string(),
  }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { loadCampaignConfig } from '../../../core/config/config.js';

vi.mock('../../../core/config/config.js', () => ({
  loadCampaignConfig: vi.fn().mockReturnValue({ name: 'default', someKey: 'value' }),
}));

describe('read_campaign_config tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns campaign config', async () => {
    const { client } = await createTestServer(registerReadCampaignConfig);

    const result = await client.callTool({
      name: 'read_campaign_config',
      arguments: { campaign: 'default' },
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.someKey).toBe('value');
  });

  it('returns error when config load fails', async () => {
    vi.mocked(loadCampaignConfig).mockImplementation(() => {
      throw new Error('config error');
    });

    const { client } = await createTestServer(registerReadCampaignConfig);

    const result = await client.callTool({
      name: 'read_campaign_config',
      arguments: { campaign: 'default' },
    });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('config error');
  });

  it('redacts apiKey, token, and clientSecret', async () => {
    vi.mocked(loadCampaignConfig).mockReturnValue({
      apiKey: 'secret-key',
      token: 'secret-token',
      clientSecret: 'secret-secret',
    } as unknown as ReturnType<typeof loadCampaignConfig>);

    const { client } = await createTestServer(registerReadCampaignConfig);

    const result = await client.callTool({
      name: 'read_campaign_config',
      arguments: { campaign: 'default' },
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.apiKey).toBe('[REDACTED]');
    expect(parsed.token).toBe('[REDACTED]');
    expect(parsed.clientSecret).toBe('[REDACTED]');
  });
});
