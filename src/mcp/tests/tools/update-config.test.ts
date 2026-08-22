import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestServer, getTextContent } from './helpers.js';
import { z } from 'zod';
import { registerUpdateConfig } from '../../tools/update-config.js';
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

vi.mock('../../schemas.js', () => ({
  UpdateConfigInput: z.object({
    patch: z.record(z.string(), z.unknown()),
  }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../lib/config/config.js', () => ({
  updateGlobalConfig: vi.fn(),
  clearConfigCache: vi.fn(),
}));

import { updateGlobalConfig, clearConfigCache } from '../../../lib/config/config.js';

describe('update_config tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates config and clears cache', async () => {
    const { client } = await createTestServer((srv) => registerUpdateConfig(srv, createStore()));

    const result = await client.callTool({
      name: 'update_config',
      arguments: { patch: { llmModel: 'gpt-4' } },
    });
    expect(vi.mocked(updateGlobalConfig)).toHaveBeenCalledWith({ llmModel: 'gpt-4' });
    expect(vi.mocked(clearConfigCache)).toHaveBeenCalledOnce();
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.status).toBe('ok');
  });

  it('returns error when core function fails', async () => {
    vi.mocked(updateGlobalConfig).mockImplementationOnce(() => {
      throw new Error('invalid config');
    });

    const { client } = await createTestServer((srv) => registerUpdateConfig(srv, createStore()));

    const result = await client.callTool({
      name: 'update_config',
      arguments: { patch: { llmModel: 'gpt-4' } },
    });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('invalid config');
  });
});
