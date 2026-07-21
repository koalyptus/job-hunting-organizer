import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';

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

vi.mock('../../schemas.js', async () => {
  const { z } = await import('zod');
  return {
    UpdateConfigInput: z.object({
      patch: z.record(z.unknown()),
    }),
  };
});

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockUpdateGlobalConfig = vi.fn();
const mockClearConfigCache = vi.fn();

vi.mock('../../../core/config/config.js', async () => ({
  updateGlobalConfig: mockUpdateGlobalConfig,
  clearConfigCache: mockClearConfigCache,
}));

describe('update_config tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates config and clears cache', async () => {
    const { registerUpdateConfig } = await import('../../tools/update-config.js');
    const { server, getCallback } = fakeServer();
    registerUpdateConfig(server);
    const cb = getCallback()!;

    const result = await cb(
      { patch: { llmModel: 'gpt-4' } },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(mockUpdateGlobalConfig).toHaveBeenCalledWith({ llmModel: 'gpt-4' });
    expect(mockClearConfigCache).toHaveBeenCalledOnce();
    const parsed = JSON.parse(getTextContent(result));
    expect(parsed.status).toBe('ok');
  });

  it('returns error when core function fails', async () => {
    mockUpdateGlobalConfig.mockImplementationOnce(() => {
      throw new Error('invalid config');
    });

    const { registerUpdateConfig } = await import('../../tools/update-config.js');
    const { server, getCallback } = fakeServer();
    registerUpdateConfig(server);
    const cb = getCallback()!;

    const result = await cb(
      { patch: { llmModel: 'gpt-4' } },
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('invalid config');
  });
});
