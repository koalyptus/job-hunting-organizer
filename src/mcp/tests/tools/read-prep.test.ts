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
  ReadPrepInput: z.object({
    campaign: z.string(),
    slug: z.string(),
  }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/prepare/index.js', () => ({
  readPrep: vi.fn(),
}));

import { readPrep } from '../../../core/prepare/index.js';
import { registerReadPrep } from '../../tools/read-prep.js';

describe('read_prep tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns prep content', async () => {
    const testPrepContent =
      '# Prep Plan\n\n## Week 1\n- Research React hooks pattern\n- Study Typescript generics';
    vi.mocked(readPrep).mockResolvedValue(testPrepContent);

    const { server, getCallback } = fakeServer();
    registerReadPrep(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'test-app' },
      { signal: AbortSignal.timeout(3000) },
    );
    const data = getTextContent(result);
    expect(data).toContain('Prep Plan');
    expect(data).toContain('React hooks');
  });

  it('returns error when prep does not exist', async () => {
    vi.mocked(readPrep).mockImplementation(() => {
      throw new Error('Prep not found: missing-app');
    });

    const { server, getCallback } = fakeServer();
    registerReadPrep(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'missing-app' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('Prep not found');
  });
});
