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

vi.mock('../../../core/campaign/profile-writer.js', async () => ({
  writeProfile: vi.fn().mockResolvedValue(true),
}));

describe('update_profile tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes profile and returns success', async () => {
    const { writeProfile } = await import('../../../core/campaign/profile-writer.js');
    vi.mocked(writeProfile).mockResolvedValue(true);

    const { registerUpdateProfile } = await import('../../tools/update-profile.js');
    const { server, getCallback } = fakeServer();
    registerUpdateProfile(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', content: '# New Profile' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(writeProfile).toHaveBeenCalledWith('default', '# New Profile');
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.success).toBe(true);
  });

  it('returns error when core function fails', async () => {
    const { writeProfile } = await import('../../../core/campaign/profile-writer.js');
    vi.mocked(writeProfile).mockRejectedValue(new Error('failed to write profile'));

    const { registerUpdateProfile } = await import('../../tools/update-profile.js');
    const { server, getCallback } = fakeServer();
    registerUpdateProfile(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', content: '# Broken' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('failed to write profile');
  });
});
