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
  return {
    OwnershipInput: z.object({}),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/campaign/ownership.js', async () => ({
  renderOwnership: vi.fn(),
  OWNERSHIP_ROWS: [],
}));

describe('ownership tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns markdown ownership table', async () => {
    const { renderOwnership } = await import('../../../core/campaign/ownership.js');
    vi.mocked(renderOwnership).mockReturnValue(
      '| File | Tool writes |\n| --- | --- |\n| meta.md | yes |',
    );

    const { registerOwnership } = await import('../../tools/ownership-tool.js');
    const { server, getCallback } = fakeServer();
    registerOwnership(server);
    const cb = getCallback()!;

    const result = await cb({}, { signal: AbortSignal.timeout(3000) });
    expect(getTextContent(result)).toContain('meta.md');
    expect(renderOwnership).toHaveBeenCalledWith({ markdown: true });
  });

  it('returns error when core function fails', async () => {
    const { renderOwnership } = await import('../../../core/campaign/ownership.js');
    vi.mocked(renderOwnership).mockImplementation(() => {
      throw new Error('test error');
    });

    const { registerOwnership } = await import('../../tools/ownership-tool.js');
    const { server, getCallback } = fakeServer();
    registerOwnership(server);
    const cb = getCallback()!;

    const result = await cb({}, { signal: AbortSignal.timeout(3000) });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('test error');
  });
});
