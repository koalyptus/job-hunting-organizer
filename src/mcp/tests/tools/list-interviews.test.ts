import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import { resolveCampaignRoot, resolveAppliedDir } from '../../../lib/paths.js';
import { listInterviews } from '../../../workflow/interviews/interviews.js';
import { registerListInterviews } from '../../tools/list-interviews.js';
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
  ListInterviewsInput: z.object({ campaign: z.string(), slug: z.string() }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../workflow/interviews/interviews.js', () => ({
  listInterviews: vi.fn(),
  addInterview: vi.fn(),
  markInterviewStatus: vi.fn(),
  appendInterviewNotes: vi.fn(),
  parseInterviewsFile: vi.fn(),
  InterviewNotFoundError: class InterviewNotFoundError extends Error {},
}));

describe('list_interviews tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns interview entries', async () => {
    vi.mocked(resolveCampaignRoot).mockReturnValue('/data/campaigns/default');
    vi.mocked(resolveAppliedDir).mockReturnValue('/data/campaigns/default/applied');
    vi.mocked(listInterviews).mockResolvedValue([]);

    const { client } = await createTestServer((srv) => registerListInterviews(srv, createStore()));

    const result = await client.callTool({
      name: 'list_interviews',
      arguments: { campaign: 'default', slug: '2026-Jan-01-eng-acme' },
    });
    const data = JSON.parse(getTextContent(result));
    expect(data.interviews).toEqual([]);
  });

  it('returns error when core function fails', async () => {
    vi.mocked(resolveCampaignRoot).mockReturnValue('/data/campaigns/default');
    vi.mocked(resolveAppliedDir).mockReturnValue('/data/campaigns/default/applied');
    vi.mocked(listInterviews).mockImplementation(() => {
      throw new Error('test error');
    });

    const { client } = await createTestServer((srv) => registerListInterviews(srv, createStore()));

    const result = await client.callTool({
      name: 'list_interviews',
      arguments: { campaign: 'default', slug: '2026-Jan-01-eng-acme' },
    });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('test error');
  });
});
