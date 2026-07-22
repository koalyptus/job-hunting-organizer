import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import { resolveCampaignRoot, resolveAppliedDir } from '../../../core/paths.js';
import { repairApp, repairAll } from '../../../core/repair/repair.js';
import { registerRepair } from '../../tools/repair-tool.js';

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

vi.mock('../../schemas.js', () => ({
  RepairInput: z.object({ campaign: z.string(), slug: z.string().optional() }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/repair/repair.js', () => ({
  repairApp: vi.fn(),
  repairAll: vi.fn(),
  RepairError: class RepairError extends Error {},
}));

describe('repair tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('repairs entire campaign when no slug provided', async () => {
    vi.mocked(resolveCampaignRoot).mockReturnValue('/data/campaigns/default');
    vi.mocked(resolveAppliedDir).mockReturnValue('/data/campaigns/default/applied');
    vi.mocked(repairAll).mockResolvedValue({ actions: [], isIndexRebuilt: true });

    const { server, getCallback } = fakeServer();
    registerRepair(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    const data = JSON.parse(getTextContent(result));
    expect(data.isIndexRebuilt).toBe(true);
    expect(repairAll).toHaveBeenCalled();
  });

  it('repairs single app when slug provided', async () => {
    vi.mocked(resolveCampaignRoot).mockReturnValue('/data/campaigns/default');
    vi.mocked(resolveAppliedDir).mockReturnValue('/data/campaigns/default/applied');
    vi.mocked(repairApp).mockResolvedValue({ actions: [], isIndexRebuilt: false });

    const { server, getCallback } = fakeServer();
    registerRepair(server);
    const cb = getCallback()!;

    await cb(
      { campaign: 'default', slug: '2026-Jan-01-eng-acme' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(repairApp).toHaveBeenCalledWith(
      '/data/campaigns/default/applied',
      '2026-Jan-01-eng-acme',
    );
  });

  it('returns error when core function fails', async () => {
    vi.mocked(resolveCampaignRoot).mockReturnValue('/data/campaigns/default');
    vi.mocked(resolveAppliedDir).mockReturnValue('/data/campaigns/default/applied');
    vi.mocked(repairAll).mockImplementation(() => {
      throw new Error('test error');
    });

    const { server, getCallback } = fakeServer();
    registerRepair(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('test error');
  });
});
