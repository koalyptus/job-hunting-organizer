import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import { registerRenameApplication } from '../../tools/rename-application.js';
import { renameApplication } from '../../../core/applications/rename.js';

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
    RenameApplicationInput: z.object({
      campaign: CampaignParam,
      from: SlugParam,
      to: SlugParam,
    }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/applications/rename.js', () => ({
  renameApplication: vi.fn().mockResolvedValue(undefined),
  RenameApplicationError: class extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'RenameApplicationError';
    }
  },
  InvalidSlugError: class extends Error {
    constructor(slug: string) {
      super(`invalid application slug "${slug}"`);
      this.name = 'InvalidSlugError';
    }
  },
  SelfRenameError: class extends Error {
    constructor(oldSlug: string) {
      super(`refusing to rename application "${oldSlug}"`);
      this.name = 'SelfRenameError';
    }
  },
}));

describe('rename_application tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renames an application successfully', async () => {
    vi.mocked(renameApplication).mockResolvedValue(undefined);

    const { server, getCallback } = fakeServer();
    registerRenameApplication(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', from: 'old-app', to: 'new-app' },
      { signal: AbortSignal.timeout(3000) },
    );
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.from).toBe('old-app');
    expect(parsed.to).toBe('new-app');
    expect(parsed.renamed).toBe(true);
  });

  it('returns error when core function fails', async () => {
    vi.mocked(renameApplication).mockRejectedValue(new Error('rename failed'));

    const { server, getCallback } = fakeServer();
    registerRenameApplication(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', from: 'old-app', to: 'new-app' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('rename failed');
  });
});
