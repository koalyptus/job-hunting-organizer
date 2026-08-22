import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import { registerRemoveApplication } from '../../tools/remove-application.js';
import { createStore } from '../../../storage/index.js';
import { deleteApplication } from '../../../workflow/applications/applications.js';
import { mcpLogger } from '../../logger.js';

vi.mock('../../../lib/logger/logger.js', () => ({
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

vi.mock('../../../workflow/applications/applications.js', () => ({
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

    const { client } = await createTestServer((srv) =>
      registerRemoveApplication(srv, createStore()),
    );

    const result = await client.callTool({
      name: 'remove_application',
      arguments: { campaign: 'default', slug: 'test-app' },
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.slug).toBe('test-app');
    expect(parsed.removed).toBe(true);

    expect(vi.mocked(mcpLogger.debug)).toHaveBeenCalledWith(
      { campaign: 'default', slug: 'test-app' },
      'tool.remove_application.start',
    );
    expect(vi.mocked(mcpLogger.debug)).toHaveBeenCalledWith(
      { slug: 'test-app' },
      'tool.remove_application.done',
    );
  });

  it('returns error when application not found', async () => {
    vi.mocked(deleteApplication).mockResolvedValue(false);

    const { client } = await createTestServer((srv) =>
      registerRemoveApplication(srv, createStore()),
    );

    const result = await client.callTool({
      name: 'remove_application',
      arguments: { campaign: 'default', slug: 'non-existent' },
    });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('not found');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(deleteApplication).mockRejectedValue(new Error('delete failed'));

    const { client } = await createTestServer((srv) =>
      registerRemoveApplication(srv, createStore()),
    );

    const result = await client.callTool({
      name: 'remove_application',
      arguments: { campaign: 'default', slug: 'test-app' },
    });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('delete failed');
  });
});
