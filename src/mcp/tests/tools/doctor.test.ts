import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import { resolveCampaignRoot, resolveAppliedDir } from '../../../lib/paths.js';
import { diagnoseCampaign, diagnoseApp } from '../../../workflow/doctor/doctor.js';
import { registerDoctor } from '../../tools/doctor-tool.js';
import { createStore } from '../../../storage/index.js';

vi.mock('../../../lib/logger/logger.js', () => ({
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../lib/paths.js', () => ({
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
  DoctorInput: z.object({ campaign: z.string(), slug: z.string().optional() }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../workflow/doctor/doctor.js', () => ({
  diagnoseCampaign: vi.fn(),
  diagnoseApp: vi.fn(),
  DoctorError: class DoctorError extends Error {},
}));

describe('doctor tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('diagnoses campaign when no slug provided', async () => {
    vi.mocked(resolveCampaignRoot).mockReturnValue('/data/campaigns/default');
    vi.mocked(resolveAppliedDir).mockReturnValue('/data/campaigns/default/applied');
    vi.mocked(diagnoseCampaign).mockResolvedValue([]);

    const { client } = await createTestServer((srv) => registerDoctor(srv, createStore()));

    const result = await client.callTool({ name: 'doctor', arguments: { campaign: 'default' } });
    const data = JSON.parse(getTextContent(result));
    expect(data.issues).toEqual([]);
    expect(diagnoseCampaign).toHaveBeenCalled();
  });

  it('diagnoses single app when slug provided', async () => {
    vi.mocked(resolveCampaignRoot).mockReturnValue('/data/campaigns/default');
    vi.mocked(resolveAppliedDir).mockReturnValue('/data/campaigns/default/applied');
    vi.mocked(diagnoseApp).mockResolvedValue([]);

    const { client } = await createTestServer((srv) => registerDoctor(srv, createStore()));

    await client.callTool({
      name: 'doctor',
      arguments: { campaign: 'default', slug: '2026-Jan-01-eng-acme' },
    });
    expect(diagnoseApp).toHaveBeenCalledWith(
      '/data/campaigns/default/applied',
      '2026-Jan-01-eng-acme',
    );
  });

  it('returns error when core function fails', async () => {
    vi.mocked(resolveCampaignRoot).mockReturnValue('/data/campaigns/default');
    vi.mocked(resolveAppliedDir).mockReturnValue('/data/campaigns/default/applied');
    vi.mocked(diagnoseCampaign).mockImplementation(() => {
      throw new Error('test error');
    });

    const { client } = await createTestServer((srv) => registerDoctor(srv, createStore()));

    const result = await client.callTool({ name: 'doctor', arguments: { campaign: 'default' } });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('test error');
  });
});
