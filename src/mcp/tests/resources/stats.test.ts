import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer } from './helpers.js';
import { computeStats } from '../../../core/stats/stats.js';
import { registerStats } from '../../resources/stats.js';

vi.mock('../../../core/logger/logger.js', () => ({
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/paths.js', () => ({
  resolveCampaignRoot: vi.fn().mockReturnValue('/mock/campaign'),
  resolveAppliedDir: vi.fn().mockReturnValue('/mock/applied'),
}));

vi.mock('../../../core/stats/stats.js', () => ({
  computeStats: vi.fn(),
}));

describe('stats resource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(computeStats).mockResolvedValue({ total: 10 } as never);
  });

  it('returns stats', async () => {
    const { server, getHandler } = fakeServer();
    registerStats(server);
    const handler = getHandler()!;

    const result = await handler(new URL('jho://stats/default'), { campaign: 'default' });
    expect(result.contents).toBeDefined();
    expect(result.contents).toHaveLength(1);
    const content = result.contents[0]!;
    expect(content.mimeType).toBe('application/json');
    const data = JSON.parse(content.text);
    expect(data.total).toBe(10);
  });

  it('returns error when core function fails', async () => {
    vi.mocked(computeStats).mockRejectedValue(new Error('test error'));

    const { server, getHandler } = fakeServer();
    registerStats(server);
    const handler = getHandler()!;

    const result = await handler(new URL('jho://stats/default'), { campaign: 'default' });
    expect(result.contents).toBeDefined();
    expect(result.contents).toHaveLength(1);
    const content = result.contents[0]!;
    const data = JSON.parse(content.text);
    expect(data.error).toBe('test error');
  });

  it('returns error when campaign parameter is missing', async () => {
    const { server, getHandler } = fakeServer();
    registerStats(server);
    const handler = getHandler()!;

    const result = await handler(new URL('jho://stats/default'), {
      campaign: undefined as unknown as string,
    });
    expect(result.contents).toBeDefined();
    const content = result.contents[0]!;
    const data = JSON.parse(content.text);
    expect(data.error).toContain('campaign parameter is required');
  });

  it('handles non-Error exception', async () => {
    vi.mocked(computeStats).mockRejectedValue('string error');

    const { server, getHandler } = fakeServer();
    registerStats(server);
    const handler = getHandler()!;

    const result = await handler(new URL('jho://stats/default'), { campaign: 'default' });
    expect(result.contents).toBeDefined();
    const content = result.contents[0]!;
    const data = JSON.parse(content.text);
    expect(data.error).toBe('string error');
  });

  it('handles array campaign parameter', async () => {
    const { server, getHandler } = fakeServer();
    registerStats(server);
    const handler = getHandler()!;

    const result = await handler(new URL('jho://stats/default'), {
      campaign: ['default'] as unknown as string,
    });
    expect(result.contents).toBeDefined();
    const content = result.contents[0]!;
    const data = JSON.parse(content.text);
    expect(data.total).toBe(10);
  });

  it('list handler returns empty resources', async () => {
    const { server, getListHandler } = fakeServer();
    registerStats(server);
    const listHandler = getListHandler()!;

    const result = await listHandler();
    expect(result.resources).toEqual([]);
  });
});
