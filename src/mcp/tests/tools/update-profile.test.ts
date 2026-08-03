import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import { writeProfile } from '../../../core/campaign/profile-writer.js';
import { registerUpdateProfile } from '../../tools/update-profile.js';

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
  return {
    UpdateProfileInput: z.object({
      campaign: CampaignParam,
      content: z.string(),
    }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/campaign/profile-writer.js', () => ({
  writeProfile: vi.fn().mockResolvedValue(true),
}));

describe('update_profile tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes profile and returns success', async () => {
    vi.mocked(writeProfile).mockResolvedValue(true);

    const { client } = await createTestServer(registerUpdateProfile);

    const result = await client.callTool({
      name: 'update_profile',
      arguments: { campaign: 'default', content: '# New Profile' },
    });
    expect(writeProfile).toHaveBeenCalledWith('default', '# New Profile');
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.success).toBe(true);
  });

  it('returns error when core function fails', async () => {
    vi.mocked(writeProfile).mockRejectedValue(new Error('failed to write profile'));

    const { client } = await createTestServer(registerUpdateProfile);

    const result = await client.callTool({
      name: 'update_profile',
      arguments: { campaign: 'default', content: '# Broken' },
    });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('failed to write profile');
  });
});
