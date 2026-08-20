import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import { renderOwnership } from '../../../workflow/campaign/ownership.js';
import { registerOwnership } from '../../tools/ownership-tool.js';
import { createStore } from '../../../storage/index.js';

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
  OwnershipInput: z.object({}),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../workflow/campaign/ownership.js', () => ({
  renderOwnership: vi.fn(),
  OWNERSHIP_ROWS: [],
}));

describe('ownership tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns markdown ownership table', async () => {
    vi.mocked(renderOwnership).mockReturnValue(
      '| File | Tool writes |\n| --- | --- |\n| meta.md | yes |',
    );

    const { client } = await createTestServer((srv) => registerOwnership(srv, createStore()));

    const result = await client.callTool({ name: 'ownership', arguments: {} });
    expect(getTextContent(result)).toContain('meta.md');
    expect(renderOwnership).toHaveBeenCalledWith({ markdown: true });
  });

  it('returns error when core function fails', async () => {
    vi.mocked(renderOwnership).mockImplementation(() => {
      throw new Error('test error');
    });

    const { client } = await createTestServer((srv) => registerOwnership(srv, createStore()));

    const result = await client.callTool({ name: 'ownership', arguments: {} });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('test error');
  });
});
