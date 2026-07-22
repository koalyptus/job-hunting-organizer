import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';
import { resolveCampaignRoot } from '../../../core/paths.js';
import { registerGetRoot } from '../../tools/get-root.js';

vi.mock('../../../core/logger/logger.js', () => ({
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../core/paths.js', () => ({
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
    vi.mocked(resolveCampaignRoot).mockReturnValue('/data/campaigns/default');

    const { server, getCallback } = fakeServer();
    registerGetRoot(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    const data = JSON.parse(getTextContent(result));
    expect(data.root).toBe('/data/campaigns/default');
    expect(resolveCampaignRoot).toHaveBeenCalledWith('default');
  });

  it('returns error for invalid campaign', async () => {
    vi.mocked(resolveCampaignRoot).mockImplementation(() => {
      throw new Error('campaign not found: nonexistent');
    });

    const { server, getCallback } = fakeServer();
    registerGetRoot(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'nonexistent' }, { signal: AbortSignal.timeout(3000) });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('campaign not found');
  });
});
