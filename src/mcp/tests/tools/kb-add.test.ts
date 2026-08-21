import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { createTestServer, getTextContent } from './helpers.js';
import { registerKbAdd } from '../../tools/kb-add.js';
import { createStore } from '../../../storage/index.js';
import { ingestKnowledgeBase } from '../../../workflow/campaign/kb-ingest.js';
import { loadCampaignConfig } from '../../../lib/config/config.js';

const { KbError } = vi.hoisted(() => {
  class KbError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'KbError';
    }
  }
  return { KbError };
});

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

vi.mock('../../schemas.js', () => ({
  KbAddInput: z.object({
    campaign: z.string(),
    paths: z.array(z.string()),
  }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../workflow/campaign/kb-ingest.js', () => ({
  ingestKnowledgeBase: vi.fn().mockResolvedValue(['doc1.md', 'doc2.md']),
  KbError,
}));

vi.mock('../../../lib/config/config.js', () => ({
  loadCampaignConfig: vi.fn().mockReturnValue({ knowledgeBase: { sources: [] } }),
  updateCampaignConfig: vi.fn(),
}));

describe('kb_add tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies KB docs successfully', async () => {
    const { client } = await createTestServer((srv) => registerKbAdd(srv, createStore()));

    const result = await client.callTool({
      name: 'kb_add',
      arguments: { campaign: 'default', paths: ['/path/to/docs'] },
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.copied).toBe(2);
    expect(parsed.paths).toEqual(['doc1.md', 'doc2.md']);
  });

  it('returns error when ingest fails', async () => {
    vi.mocked(ingestKnowledgeBase).mockRejectedValue(new KbError('ingest failed'));

    const { client } = await createTestServer((srv) => registerKbAdd(srv, createStore()));

    const result = await client.callTool({
      name: 'kb_add',
      arguments: { campaign: 'default', paths: ['/bad/path'] },
    });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('ingest failed');
  });

  it('falls back to empty array when knowledgeBase.sources is undefined', async () => {
    vi.mocked(ingestKnowledgeBase).mockResolvedValue(['doc1.md', 'doc2.md']);
    vi.mocked(loadCampaignConfig).mockReturnValue({ knowledgeBase: {} } as never);

    const { client } = await createTestServer((srv) => registerKbAdd(srv, createStore()));

    const result = await client.callTool({
      name: 'kb_add',
      arguments: { campaign: 'default', paths: ['/path/to/docs'] },
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.copied).toBe(2);
  });
});
