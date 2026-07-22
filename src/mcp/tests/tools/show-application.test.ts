import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import { resolveCampaignRoot, resolveAppliedDir } from '../../../core/paths.js';
import { readShowData, readShowFile, ShowError } from '../../../core/applications/show.js';
import { registerShowApplication } from '../../tools/show-application.js';

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
  ShowApplicationInput: z.object({ campaign: z.string(), slug: z.string() }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/applications/show.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, readShowData: vi.fn(), readShowFile: vi.fn() };
});

const FRONTMATTER = {
  slug: '2026-Jan-01-eng-acme',
  status: 'applied' as const,
  appliedOn: '2026-01-01',
  title: 'Engineer',
  company: 'Acme',
  location: 'Remote',
  site: 'linkedin' as const,
  link: '',
  salary: '',
  tags: [] as string[],
  targetRole: '',
  employmentType: '' as const,
};

describe('show_application tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns frontmatter and body', async () => {
    vi.mocked(resolveCampaignRoot).mockReturnValue('/data/campaigns/default');
    vi.mocked(resolveAppliedDir).mockReturnValue('/data/campaigns/default/applied');
    vi.mocked(readShowData).mockResolvedValue({
      frontmatter: FRONTMATTER,
      body: '',
      filesPresent: [],
    });
    vi.mocked(readShowFile).mockResolvedValue('# Job Description\n\nWe are hiring...');

    const { server, getCallback } = fakeServer();
    registerShowApplication(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: '2026-Jan-01-eng-acme' },
      { signal: AbortSignal.timeout(3000) },
    );
    const data = JSON.parse(getTextContent(result));
    expect(data.frontmatter.slug).toBe('2026-Jan-01-eng-acme');
    expect(data.jdContent).toBe('# Job Description\n\nWe are hiring...');
  });

  it('returns empty jdContent when jd.md is missing', async () => {
    vi.mocked(resolveCampaignRoot).mockReturnValue('/data/campaigns/default');
    vi.mocked(resolveAppliedDir).mockReturnValue('/data/campaigns/default/applied');
    vi.mocked(readShowData).mockResolvedValue({
      frontmatter: FRONTMATTER,
      body: '',
      filesPresent: [],
    });
    vi.mocked(readShowFile).mockRejectedValue(new ShowError('File not found: jd.md'));

    const { server, getCallback } = fakeServer();
    registerShowApplication(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: '2026-Jan-01-eng-acme' },
      { signal: AbortSignal.timeout(3000) },
    );
    const data = JSON.parse(getTextContent(result));
    expect(data.frontmatter.slug).toBe('2026-Jan-01-eng-acme');
    expect(data.jdContent).toBe('');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(resolveCampaignRoot).mockReturnValue('/data/campaigns/default');
    vi.mocked(resolveAppliedDir).mockReturnValue('/data/campaigns/default/applied');
    vi.mocked(readShowData).mockRejectedValue(new Error('test error'));

    const { server, getCallback } = fakeServer();
    registerShowApplication(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: '2026-Jan-01-eng-acme' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('test error');
  });

  it('propagates non-ShowError from readShowFile', async () => {
    vi.mocked(resolveCampaignRoot).mockReturnValue('/data/campaigns/default');
    vi.mocked(resolveAppliedDir).mockReturnValue('/data/campaigns/default/applied');
    vi.mocked(readShowData).mockResolvedValue({
      frontmatter: FRONTMATTER,
      body: '',
      filesPresent: [],
    });
    vi.mocked(readShowFile).mockRejectedValue(new Error('disk failure'));

    const { server, getCallback } = fakeServer();
    registerShowApplication(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: '2026-Jan-01-eng-acme' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('disk failure');
  });
});
