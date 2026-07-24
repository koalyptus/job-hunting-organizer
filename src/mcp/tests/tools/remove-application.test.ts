import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import { registerRemoveApplication } from '../../tools/remove-application.js';
import { deleteApplication } from '../../../core/applications/applications.js';

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
    RemoveApplicationInput: z.object({
      campaign: CampaignParam,
      slug: SlugParam,
      confirm: z.boolean().optional(),
    }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/applications/applications.js', () => ({
  deleteApplication: vi.fn().mockResolvedValue(true),
  ApplicationNotFoundError: class extends Error {
    constructor(slug: string) {
      super(`application not found: ${slug}`);
      this.name = 'ApplicationNotFoundError';
    }
  },
}));

describe('remove_application tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes an application successfully', async () => {
    vi.mocked(deleteApplication).mockResolvedValue(true);

    const { server, getCallback } = fakeServer();
    registerRemoveApplication(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'test-app' },
      { signal: AbortSignal.timeout(3000) },
    );
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.slug).toBe('test-app');
    expect(parsed.removed).toBe(true);
  });

  it('returns error when application not found', async () => {
    vi.mocked(deleteApplication).mockResolvedValue(false);

    const { server, getCallback } = fakeServer();
    registerRemoveApplication(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'non-existent' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('not found');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(deleteApplication).mockRejectedValue(new Error('delete failed'));

    const { server, getCallback } = fakeServer();
    registerRemoveApplication(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'test-app' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('delete failed');
  });
});
