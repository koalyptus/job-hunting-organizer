import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import { INTERVIEW_STATUSES } from '../../../workflow/interviews/types.js';
import {
  markInterviewStatus,
  appendInterviewNotes,
} from '../../../workflow/interviews/interviews.js';
import { registerMarkInterview } from '../../tools/mark-interview.js';
import { createStore } from '../../../storage/index.js';

vi.mock('../../../lib/logger/logger.js', () => ({
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
  const SlugParam = z.string();
  return {
    MarkInterviewInput: z.object({
      campaign: CampaignParam,
      slug: SlugParam,
      index: z.number().int().nonnegative(),
      status: z.enum(INTERVIEW_STATUSES),
      notes: z.string().optional(),
    }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../workflow/interviews/interviews.js', () => ({
  markInterviewStatus: vi.fn().mockResolvedValue(true),
  appendInterviewNotes: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../lib/paths.js', () => ({
  resolveDataRoot: vi.fn(),
  resolveCampaignRoot: vi.fn((name: string) => `/campaigns/${name}`),
  resolveAppliedDir: vi.fn((root: string) => `${root}/applied`),
}));

describe('mark_interview tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks an interview status with 0-based to 1-based index conversion', async () => {
    vi.mocked(markInterviewStatus).mockResolvedValue(true);

    const { client } = await createTestServer((srv) => registerMarkInterview(srv, createStore()));

    const result = await client.callTool({
      name: 'mark_interview',
      arguments: { campaign: 'default', slug: 'test-app', index: 0, status: 'completed' },
    });
    expect(markInterviewStatus).toHaveBeenCalledWith('/campaigns/default/applied', 'test-app', {
      sectionNumber: 1,
      status: 'completed',
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.success).toBe(true);
  });

  it('appends notes when notes are provided', async () => {
    vi.mocked(markInterviewStatus).mockResolvedValue(true);
    vi.mocked(appendInterviewNotes).mockResolvedValue(true);

    const { client } = await createTestServer((srv) => registerMarkInterview(srv, createStore()));

    const result = await client.callTool({
      name: 'mark_interview',
      arguments: {
        campaign: 'default',
        slug: 'test-app',
        index: 1,
        status: 'completed',
        notes: 'Great technical discussion',
      },
    });
    expect(markInterviewStatus).toHaveBeenCalledWith('/campaigns/default/applied', 'test-app', {
      sectionNumber: 2,
      status: 'completed',
    });
    expect(appendInterviewNotes).toHaveBeenCalledWith('/campaigns/default/applied', 'test-app', {
      sectionNumber: 2,
      notes: 'Great technical discussion',
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.success).toBe(true);
  });

  it('skips notes append when notes are not provided', async () => {
    vi.mocked(markInterviewStatus).mockResolvedValue(true);
    vi.mocked(appendInterviewNotes).mockResolvedValue(true);

    const { client } = await createTestServer((srv) => registerMarkInterview(srv, createStore()));

    await client.callTool({
      name: 'mark_interview',
      arguments: { campaign: 'default', slug: 'test-app', index: 0, status: 'pending' },
    });
    expect(appendInterviewNotes).not.toHaveBeenCalled();
  });

  it('returns error when appendInterviewNotes fails', async () => {
    vi.mocked(markInterviewStatus).mockResolvedValue(true);
    vi.mocked(appendInterviewNotes).mockRejectedValue(new Error('interviews.md not found'));

    const { client } = await createTestServer((srv) => registerMarkInterview(srv, createStore()));

    const result = await client.callTool({
      name: 'mark_interview',
      arguments: {
        campaign: 'default',
        slug: 'test-app',
        index: 0,
        status: 'completed',
        notes: 'Some notes',
      },
    });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('interviews.md not found');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(markInterviewStatus).mockRejectedValue(new Error('interview not found'));

    const { client } = await createTestServer((srv) => registerMarkInterview(srv, createStore()));

    const result = await client.callTool({
      name: 'mark_interview',
      arguments: { campaign: 'default', slug: 'test-app', index: 2, status: 'completed' },
    });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('interview not found');
  });
});
