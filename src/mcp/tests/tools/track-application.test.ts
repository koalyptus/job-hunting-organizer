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
  const { APPLICATION_STATUSES, EMPLOYMENT_TYPES } =
    await import('../../../core/applications/types.js');
  const CampaignParam = z.string();
  const SlugParam = z.string();
  return {
    TrackApplicationInput: z.object({
      campaign: CampaignParam,
      url: z.string().optional(),
      slug: SlugParam.optional(),
      status: z.enum(APPLICATION_STATUSES).optional(),
      salary: z.string().optional(),
      tags: z.array(z.string()).optional(),
      targetRole: z.string().optional(),
      employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
      note: z.string().optional(),
      steer: z.string().optional(),
    }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/track/track.js', async () => ({
  runTrack: vi.fn().mockResolvedValue({ slug: 'test-app', changed: true }),
}));

describe('track_application tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an application from URL', async () => {
    const { runTrack } = await import('../../../core/track/track.js');
    vi.mocked(runTrack).mockResolvedValue({ slug: 'new-app', changed: true });

    const { registerTrackApplication } = await import('../../tools/track-application.js');
    const { server, getCallback } = fakeServer();
    registerTrackApplication(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', url: 'https://example.com/job', yes: true },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.content).toBeDefined();
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.slug).toBe('new-app');
    expect(parsed.changed).toBe(true);
  });

  it('updates an existing application by slug', async () => {
    const { runTrack } = await import('../../../core/track/track.js');
    vi.mocked(runTrack).mockResolvedValue({ slug: 'existing-app', changed: true });

    const { registerTrackApplication } = await import('../../tools/track-application.js');
    const { server, getCallback } = fakeServer();
    registerTrackApplication(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'existing-app', status: 'applied', yes: true },
      { signal: AbortSignal.timeout(3000) },
    );
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.slug).toBe('existing-app');
    expect(parsed.changed).toBe(true);
  });

  it('returns error when core function fails', async () => {
    const { runTrack } = await import('../../../core/track/track.js');
    vi.mocked(runTrack).mockRejectedValue(new Error('failed to track'));

    const { registerTrackApplication } = await import('../../tools/track-application.js');
    const { server, getCallback } = fakeServer();
    registerTrackApplication(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', url: 'https://example.com/job', yes: true },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('failed to track');
  });
});
