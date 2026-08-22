import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import {
  generateCoverLetter,
  readCoverLetter,
} from '../../../workflow/applications/cover-letter.js';
import { registerCoverLetter, registerReadCoverLetter } from '../../tools/cover-letter.js';
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
    CoverLetterInput: z.object({
      campaign: CampaignParam,
      slug: SlugParam,
      steer: z.string().optional().describe('Custom LLM instructions'),
      noSave: z.boolean().optional(),
    }),
    ReadCoverLetterInput: z.object({
      campaign: CampaignParam,
      slug: SlugParam,
    }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../workflow/applications/cover-letter.js', () => ({
  generateCoverLetter: vi.fn().mockResolvedValue({
    content: '# Cover Letter\nDear Hiring Manager...',
    wordCount: 42,
    model: 'gpt-4',
    durationMs: 5000,
  }),
  readCoverLetter: vi.fn().mockResolvedValue('# Cover Letter\nExisting content'),
}));

describe('cover_letter tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates a cover letter with explicit steer', async () => {
    vi.mocked(generateCoverLetter).mockResolvedValue({
      content: '# Cover Letter\nDear Hiring Manager...',
      wordCount: 42,
      model: 'gpt-4',
      durationMs: 5000,
    });

    const { client } = await createTestServer((srv) => registerCoverLetter(srv, createStore()));

    const result = await client.callTool({
      name: 'cover_letter',
      arguments: { campaign: 'default', slug: 'test-app', steer: 'Be concise' },
    });
    expect(generateCoverLetter).toHaveBeenCalledWith({
      slug: 'test-app',
      campaign: 'default',
      steer: 'Be concise',
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.content).toContain('Cover Letter');
    expect(parsed.wordCount).toBe(42);
  });

  it('generates cover letter with undefined steer (defaults)', async () => {
    vi.mocked(generateCoverLetter).mockResolvedValue({
      content: '# Cover Letter\nDefault steer.',
      wordCount: 10,
      model: 'gpt-4',
      durationMs: 3000,
    });

    const { client } = await createTestServer((srv) => registerCoverLetter(srv, createStore()));

    const result = await client.callTool({
      name: 'cover_letter',
      arguments: { campaign: 'default', slug: 'test-app' },
    });
    expect(generateCoverLetter).toHaveBeenCalledWith({
      slug: 'test-app',
      campaign: 'default',
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.content).toContain('Default steer');
  });

  it('passes noSave flag to core function', async () => {
    vi.mocked(generateCoverLetter).mockResolvedValue({
      content: '# Cover Letter\nNo save.',
      wordCount: 5,
      model: 'gpt-4',
      durationMs: 1000,
    });

    const { client } = await createTestServer((srv) => registerCoverLetter(srv, createStore()));

    const result = await client.callTool({
      name: 'cover_letter',
      arguments: { campaign: 'default', slug: 'test-app', noSave: true },
    });
    expect(generateCoverLetter).toHaveBeenCalledWith({
      slug: 'test-app',
      campaign: 'default',
      noSave: true,
    });
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.content).toContain('No save');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(generateCoverLetter).mockRejectedValue(new Error('Failed to read JD'));

    const { client } = await createTestServer((srv) => registerCoverLetter(srv, createStore()));

    const result = await client.callTool({
      name: 'cover_letter',
      arguments: { campaign: 'default', slug: 'test-app' },
    });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('Failed to read JD');
  });
});

describe('read_cover_letter tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads an existing cover letter', async () => {
    vi.mocked(readCoverLetter).mockResolvedValue('# Cover Letter\nDear Hiring Manager...');

    const { client } = await createTestServer((srv) => registerReadCoverLetter(srv, createStore()));

    const result = await client.callTool({
      name: 'read_cover_letter',
      arguments: { campaign: 'default', slug: 'test-app' },
    });
    expect(readCoverLetter).toHaveBeenCalledWith('default', 'test-app');
    expect(getTextContent(result)).toBe('# Cover Letter\nDear Hiring Manager...');
  });

  it('returns error when cover letter does not exist', async () => {
    vi.mocked(readCoverLetter).mockRejectedValue(
      new Error('No cover letter found for "missing-app"'),
    );

    const { client } = await createTestServer((srv) => registerReadCoverLetter(srv, createStore()));

    const result = await client.callTool({
      name: 'read_cover_letter',
      arguments: { campaign: 'default', slug: 'missing-app' },
    });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('No cover letter found');
  });
});
