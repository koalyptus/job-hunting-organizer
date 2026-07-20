import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';

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

vi.mock('../../schemas.js', async () => {
  const { z } = await import('zod');
  return {
    DoctorInput: z.object({ campaign: z.string(), slug: z.string().optional() }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/doctor/doctor.js', async () => ({
  diagnoseCampaign: vi.fn(),
  diagnoseApp: vi.fn(),
  DoctorError: class DoctorError extends Error {},
}));

describe('doctor tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('diagnoses campaign when no slug provided', async () => {
    const { resolveCampaignRoot, resolveAppliedDir } = await import('../../../core/paths.js');
    const { diagnoseCampaign } = await import('../../../core/doctor/doctor.js');
    vi.mocked(resolveCampaignRoot).mockReturnValue('/data/campaigns/default');
    vi.mocked(resolveAppliedDir).mockReturnValue('/data/campaigns/default/applied');
    vi.mocked(diagnoseCampaign).mockResolvedValue([]);

    const { registerDoctor } = await import('../../tools/doctor-tool.js');
    const { server, getCallback } = fakeServer();
    registerDoctor(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    const data = JSON.parse(getTextContent(result));
    expect(data.issues).toEqual([]);
    expect(diagnoseCampaign).toHaveBeenCalled();
  });

  it('diagnoses single app when slug provided', async () => {
    const { resolveCampaignRoot, resolveAppliedDir } = await import('../../../core/paths.js');
    const { diagnoseApp } = await import('../../../core/doctor/doctor.js');
    vi.mocked(resolveCampaignRoot).mockReturnValue('/data/campaigns/default');
    vi.mocked(resolveAppliedDir).mockReturnValue('/data/campaigns/default/applied');
    vi.mocked(diagnoseApp).mockResolvedValue([]);

    const { registerDoctor } = await import('../../tools/doctor-tool.js');
    const { server, getCallback } = fakeServer();
    registerDoctor(server);
    const cb = getCallback()!;

    await cb(
      { campaign: 'default', slug: '2026-Jan-01-eng-acme' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(diagnoseApp).toHaveBeenCalledWith(
      '/data/campaigns/default/applied',
      '2026-Jan-01-eng-acme',
    );
  });

  it('returns error when core function fails', async () => {
    const { resolveCampaignRoot, resolveAppliedDir } = await import('../../../core/paths.js');
    const { diagnoseCampaign } = await import('../../../core/doctor/doctor.js');
    vi.mocked(resolveCampaignRoot).mockReturnValue('/data/campaigns/default');
    vi.mocked(resolveAppliedDir).mockReturnValue('/data/campaigns/default/applied');
    vi.mocked(diagnoseCampaign).mockImplementation(() => {
      throw new Error('test error');
    });

    const { registerDoctor } = await import('../../tools/doctor-tool.js');
    const { server, getCallback } = fakeServer();
    registerDoctor(server);
    const cb = getCallback()!;

    const result = await cb({ campaign: 'default' }, { signal: AbortSignal.timeout(3000) });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('test error');
  });
});
