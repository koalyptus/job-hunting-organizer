import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';
import { registerKbAdd } from '../../tools/kb-add.js';
import { ingestKnowledgeBase } from '../../../core/campaign/kb-ingest.js';
import { loadCampaignConfig } from '../../../core/config/config.js';

const { z } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('zod');
});

const { KbError } = vi.hoisted(() => {
  class KbError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'KbError';
    }
  }
  return { KbError };
});

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
  KbAddInput: z.object({
    campaign: z.string(),
    paths: z.array(z.string()),
  }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/campaign/kb-ingest.js', () => ({
  ingestKnowledgeBase: vi.fn().mockResolvedValue(['doc1.md', 'doc2.md']),
  KbError,
}));

vi.mock('../../../core/config/config.js', () => ({
  loadCampaignConfig: vi.fn().mockReturnValue({ knowledgeBase: { sources: [] } }),
  updateCampaignConfig: vi.fn(),
}));

describe('kb_add tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies KB docs successfully', async () => {
    const { server, getCallback } = fakeServer();
    registerKbAdd(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', paths: ['/path/to/docs'] },
      { signal: AbortSignal.timeout(3000) },
    );
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.copied).toBe(2);
    expect(parsed.paths).toEqual(['doc1.md', 'doc2.md']);
  });

  it('returns error when ingest fails', async () => {
    vi.mocked(ingestKnowledgeBase).mockRejectedValue(new KbError('ingest failed'));

    const { server, getCallback } = fakeServer();
    registerKbAdd(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', paths: ['/bad/path'] },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('ingest failed');
  });

  it('falls back to empty array when knowledgeBase.sources is undefined', async () => {
    vi.mocked(ingestKnowledgeBase).mockResolvedValue(['doc1.md', 'doc2.md']);
    vi.mocked(loadCampaignConfig).mockReturnValue({ knowledgeBase: {} } as never);

    const { server, getCallback } = fakeServer();
    registerKbAdd(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', paths: ['/path/to/docs'] },
      { signal: AbortSignal.timeout(3000) },
    );
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.copied).toBe(2);
  });
});
