import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer } from './helpers.js';
import { loadGlobalConfig } from '../../../core/config/config.js';
import { redactSecrets } from '../../../core/config/config.view.js';
import { registerConfig } from '../../resources/config.js';

vi.mock('../../../core/logger/logger.js', () => ({
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/config/config.js', () => ({
  loadGlobalConfig: vi.fn().mockReturnValue({ llm: { apiKey: 'sk-abc123', provider: 'openai' } }),
}));

vi.mock('../../../core/config/config.view.js', () => ({
  redactSecrets: vi.fn().mockImplementation((config) => ({
    ...config,
    llm: { ...config.llm, apiKey: '***' },
  })),
}));

describe('config resource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns global config with redacted secrets', async () => {
    const { server, getHandler } = fakeServer();
    registerConfig(server);
    const handler = getHandler()!;

    const result = await handler(new URL('jho://config'), {});
    expect(result.contents).toBeDefined();
    expect(result.contents).toHaveLength(1);
    const content = result.contents[0]!;
    expect(content.mimeType).toBe('application/json');
    const data = JSON.parse(content.text);
    expect(data.llm.apiKey).toBe('***');
    expect(redactSecrets).toHaveBeenCalledOnce();
    expect(redactSecrets).toHaveBeenCalledWith({
      llm: { apiKey: 'sk-abc123', provider: 'openai' },
    });
  });

  it('returns error when core function fails', async () => {
    vi.mocked(loadGlobalConfig).mockImplementation(() => {
      throw new Error('test error');
    });

    const { server, getHandler } = fakeServer();
    registerConfig(server);
    const handler = getHandler()!;

    const result = await handler(new URL('jho://config'), {});
    expect(result.contents).toBeDefined();
    expect(result.contents).toHaveLength(1);
    const content = result.contents[0]!;
    const data = JSON.parse(content.text);
    expect(data.error).toBe('test error');
  });

  it('handles non-Error exception', async () => {
    vi.mocked(loadGlobalConfig).mockImplementation(() => {
      throw 'string error';
    });

    const { server, getHandler } = fakeServer();
    registerConfig(server);
    const handler = getHandler()!;

    const result = await handler(new URL('jho://config'), {});
    expect(result.contents).toBeDefined();
    const content = result.contents[0]!;
    const data = JSON.parse(content.text);
    expect(data.error).toBe('string error');
  });
});
