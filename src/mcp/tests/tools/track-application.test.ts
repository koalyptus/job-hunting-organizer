import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import { APPLICATION_STATUSES, EMPLOYMENT_TYPES } from '../../../core/applications/types.js';
import { runTrack } from '../../../core/track/track.js';
import { registerTrackApplication } from '../../tools/track-application.js';

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

vi.mock('../../../core/track/track.js', () => ({
  runTrack: vi.fn().mockResolvedValue({ slug: 'test-app', changed: true }),
}));

describe('track_application tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an application from URL', async () => {
    vi.mocked(runTrack).mockResolvedValue({ slug: 'new-app', changed: true });

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
    vi.mocked(runTrack).mockResolvedValue({ slug: 'existing-app', changed: true });

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
    vi.mocked(runTrack).mockRejectedValue(new Error('failed to track'));

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
