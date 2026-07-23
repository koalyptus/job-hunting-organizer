import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';
import { z } from 'zod';

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

vi.mock('../../schemas.js', () => ({
  ReadQaInput: z.object({
    campaign: z.string(),
    slug: z.string(),
  }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/applications/application-qa.js', () => ({
  readQa: vi.fn(),
}));

import { readQa } from '../../../core/applications/application-qa.js';
import { registerReadQa } from '../../tools/read-qa.js';

describe('read_qa tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns Q&A content', async () => {
    const testQaContent =
      '# Q&A\n\n## 2026-01-15 "Tell me about yourself"\n\n- Source: application form\n- Answer: I am a dedicated software engineer with 5 years of experience...';
    vi.mocked(readQa).mockResolvedValue(testQaContent);

    const { server, getCallback } = fakeServer();
    registerReadQa(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'test-app' },
      { signal: AbortSignal.timeout(3000) },
    );
    const data = getTextContent(result);
    expect(data).toContain('Q&A');
    expect(data).toContain('Tell me about yourself');
  });

  it('returns error when Q&A does not exist', async () => {
    vi.mocked(readQa).mockImplementation(() => {
      throw new Error(
        'No Q&A entries found for "missing-app".\nGenerate one with: jho answer missing-app "your question"',
      );
    });

    const { server, getCallback } = fakeServer();
    registerReadQa(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'missing-app' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('No Q&A entries found');
  });
});
