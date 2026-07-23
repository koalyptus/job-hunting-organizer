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
  ReadRetroInput: z.object({
    campaign: z.string(),
    slug: z.string(),
  }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/retro/index.js', () => ({
  showRetro: vi.fn(),
}));

import { showRetro } from '../../../core/retro/index.js';
import { registerReadRetro } from '../../tools/read-retro.js';

describe('read_retro tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns retro content', async () => {
    const testRetroContent =
      '# Retro\n\n## Week 1\n- Fixed SQL performance issues\n- Learned about connection pooling';
    vi.mocked(showRetro).mockResolvedValue(testRetroContent);

    const { server, getCallback } = fakeServer();
    registerReadRetro(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'test-app' },
      { signal: AbortSignal.timeout(3000) },
    );
    const data = getTextContent(result);
    expect(data).toContain('Retro');
    expect(data).toContain('SQL performance issues');
  });

  it('returns error when retro does not exist', async () => {
    vi.mocked(showRetro).mockImplementation(() => {
      throw new Error('retro not found: missing-app');
    });

    const { server, getCallback } = fakeServer();
    registerReadRetro(server);
    const cb = getCallback()!;

    const result = await cb(
      { campaign: 'default', slug: 'missing-app' },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('retro not found');
  });
});
