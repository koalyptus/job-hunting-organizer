import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { fakeServer, getTextContent } from './helpers.js';
import { registerKbUpdate } from '../../tools/kb-update.js';
import { syncKnowledgeBase } from '../../../core/campaign/kb-ingest.js';
import { loadCampaignConfig } from '../../../core/config/config.js';

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
  KbUpdateInput: z.object({
    campaign: z.string(),
  }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/campaign/kb-ingest.js', () => ({
  syncKnowledgeBase: vi.fn().mockResolvedValue(['doc1.md', 'doc2.md']),
  KbError: class extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'KbError';
    }
  },
}));

vi.mock('../../../core/config/config.js', () => ({
  loadCampaignConfig: vi.fn().mockReturnValue({ knowledgeBase: { sources: ['/path/to/docs'] } }),
}));

describe('kb_update tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs KB successfully', async () => {
    const { server, getCallback } = fakeServer();
    registerKbUpdate(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.count).toBe(2);
  });

  it('returns error when sync fails', async () => {
    vi.mocked(syncKnowledgeBase).mockRejectedValue(new Error('sync failed'));

    const { server, getCallback } = fakeServer();
    registerKbUpdate(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('sync failed');
  });

  it('falls back to empty array when sources is undefined', async () => {
    vi.mocked(syncKnowledgeBase).mockResolvedValue(['doc1.md', 'doc2.md']);
    vi.mocked(loadCampaignConfig).mockReturnValue({ knowledgeBase: {} } as never);

    const { server, getCallback } = fakeServer();
    registerKbUpdate(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.count).toBe(2);
  });
});
