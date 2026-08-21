import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestServer, getTextContent } from './helpers.js';
import { z } from 'zod';

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
import { createStore } from '../../../storage/index.js';

describe('read_retro tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns retro content', async () => {
    const testRetroContent =
      '# Retro\n\n## Week 1\n- Fixed SQL performance issues\n- Learned about connection pooling';
    vi.mocked(showRetro).mockResolvedValue(testRetroContent);

    const { client } = await createTestServer((srv) => registerReadRetro(srv, createStore()));

    const result = await client.callTool({
      name: 'read_retro',
      arguments: { campaign: 'default', slug: 'test-app' },
    });
    const data = getTextContent(result);
    expect(data).toContain('Retro');
    expect(data).toContain('SQL performance issues');
  });

  it('returns error when retro does not exist', async () => {
    vi.mocked(showRetro).mockImplementation(() => {
      throw new Error('retro not found: missing-app');
    });

    const { client } = await createTestServer((srv) => registerReadRetro(srv, createStore()));

    const result = await client.callTool({
      name: 'read_retro',
      arguments: { campaign: 'default', slug: 'missing-app' },
    });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('retro not found');
  });
});
