import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';

vi.mock('../../../core/logger/logger.js', () => ({
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../core/paths.js', async () => ({
  resolveCampaignRoot: vi.fn(),
  resolveAppliedDir: vi.fn(),
  resolveDataRoot: vi.fn(),
  resolveConfigHome: vi.fn(),
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
    ReadProfileInput: z.object({ campaign: z.string() }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/campaign/profile-read.js', () => ({
  readProfile: vi.fn(),
}));

describe('read_profile tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns profile content', async () => {
    const { resolveCampaignRoot } = await import('../../../core/paths.js');
    const { readProfile } = await import('../../../core/campaign/profile-read.js');
    vi.mocked(resolveCampaignRoot).mockReturnValue('/data/campaigns/default');
    vi.mocked(readProfile).mockResolvedValue('# Candidate Profile\n\nExperienced engineer...');

    const { registerReadProfile } = await import('../../tools/read-profile.js');
    const { server, getCallback } = fakeServer();
    registerReadProfile(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    const data = JSON.parse(getTextContent(result));
    expect(data.content).toContain('Candidate Profile');
  });

  it('returns error when core function fails', async () => {
    const { resolveCampaignRoot } = await import('../../../core/paths.js');
    const { readProfile } = await import('../../../core/campaign/profile-read.js');
    vi.mocked(resolveCampaignRoot).mockReturnValue('/data/campaigns/default');
    vi.mocked(readProfile).mockImplementation(() => {
      throw new Error('test error');
    });

    const { registerReadProfile } = await import('../../tools/read-profile.js');
    const { server, getCallback } = fakeServer();
    registerReadProfile(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('test error');
  });
});
