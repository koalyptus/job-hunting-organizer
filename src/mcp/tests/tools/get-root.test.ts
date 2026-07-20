import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer } from './helpers.js';

vi.mock('../../../core/logger/logger.js', () => ({
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../core/paths.js', async () => ({
  resolveCampaignRoot: vi.fn(),
  resolveAppliedDir: vi.fn(),
  resolveDataRoot: vi.fn(),
  resolveConfigHome: vi.fn(),
}));

vi.mock('../../error-handler.js', () => ({
  handleToolError: vi.fn((err: unknown) => ({
    content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
    isError: true as const,
  })),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('get_root tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls resolveCampaignRoot and returns JSON', async () => {
    const { resolveCampaignRoot } = await import('../../../core/paths.js');
    vi.mocked(resolveCampaignRoot).mockReturnValue('/data/campaigns/default');

    const { registerGetRoot } = await import('../../tools/get-root.js');
    const { server, getCallback } = fakeServer();
    registerGetRoot(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    const item = result.content[0]!;
    const data = JSON.parse('text' in item ? item.text : '{}');
    expect(data.root).toBe('/data/campaigns/default');
    expect(resolveCampaignRoot).toHaveBeenCalledWith('default');
  });

  it('returns error for invalid campaign', async () => {
    const { resolveCampaignRoot } = await import('../../../core/paths.js');
    vi.mocked(resolveCampaignRoot).mockImplementation(() => {
      throw new Error('campaign not found: nonexistent');
    });

    const { registerGetRoot } = await import('../../tools/get-root.js');
    const { server, getCallback } = fakeServer();
    registerGetRoot(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'nonexistent' }, { signal: AbortSignal.timeout(3000) });
    expect(result.isError).toBe(true);
    const item = result.content[0]!;
    expect('text' in item ? item.text : '').toContain('campaign not found');
  });
});
