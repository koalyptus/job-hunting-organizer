import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import { aggregateRetros } from '../../../core/retro/aggregate.js';
import { registerAggregateRetros } from '../../tools/aggregate-retros.js';

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
  return {
    AggregateRetrosInput: z.object({
      campaign: CampaignParam,
      targetRole: z.string().optional().describe('Filter by target role slug'),
      includeAbandoned: z.boolean().optional().describe('Include abandoned applications'),
    }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/paths.js', () => ({
  resolveCampaignRoot: vi.fn(() => '/data/campaigns/default'),
  resolveAppliedDir: vi.fn(() => '/data/campaigns/default/applied'),
}));

vi.mock('../../../core/retro/aggregate.js', () => ({
  aggregateRetros: vi.fn().mockResolvedValue([
    { label: 'System design — consistency models', count: 3, apps: ['app1', 'app2', 'app3'] },
    { label: 'Behavioral — STAR format', count: 2, apps: ['app1', 'app4'] },
  ]),
}));

describe('aggregate_retros tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates retros with target role filter', async () => {
    vi.mocked(aggregateRetros).mockResolvedValue([
      { label: 'System design — consistency models', count: 3, apps: ['app1', 'app2', 'app3'] },
      { label: 'Behavioral — STAR format', count: 2, apps: ['app1', 'app4'] },
    ]);

    const { server, getCallback } = fakeServer();
    registerAggregateRetros(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', targetRole: 'backend-engineer', includeAbandoned: false },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(aggregateRetros).toHaveBeenCalledWith('/data/campaigns/default/applied', {
      role: 'backend-engineer',
      includeAbandoned: false,
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed[0].label).toBe('System design — consistency models');
    expect(parsed[0].count).toBe(3);
    expect(parsed[1].label).toBe('Behavioral — STAR format');
  });

  it('aggregates retros with undefined filters (defaults)', async () => {
    vi.mocked(aggregateRetros).mockResolvedValue([
      { label: 'System design — consistency models', count: 1, apps: ['app1'] },
    ]);

    const { server, getCallback } = fakeServer();
    registerAggregateRetros(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    expect(aggregateRetros).toHaveBeenCalledWith('/data/campaigns/default/applied', {
      role: undefined,
      includeAbandoned: undefined,
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed[0].count).toBe(1);
  });

  it('returns error when core function fails', async () => {
    vi.mocked(aggregateRetros).mockRejectedValue(new Error('Failed to list applications'));

    const { server, getCallback } = fakeServer();
    registerAggregateRetros(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('Failed to list applications');
  });
});
