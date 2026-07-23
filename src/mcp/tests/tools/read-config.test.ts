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
  ReadConfigInput: z.object({}),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/config/config.js', () => ({
  loadGlobalConfig: vi.fn(),
}));

vi.mock('../../../core/config/config.view.js', () => ({
  redactSecrets: vi.fn((c: unknown) => c),
}));

import { loadGlobalConfig } from '../../../core/config/config.js';
import { redactSecrets } from '../../../core/config/config.view.js';
import { registerReadConfig } from '../../tools/read-config.js';

describe('read_config tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successfully returns redacted global configuration', async () => {
    const testConfig = {
      global: {
        llm: { model: 'gpt-4', baseUrl: 'https://api.openai.com/v1', apiKey: 'secret-key' },
        github: { username: 'testuser', token: 'gh-token' },
        calendar: { provider: 'none' },
        logging: { level: 'info', file: '/path/to/log' },
      },
      campaign: {
        targetRole: 'senior-engineer',
        cvPath: '/path/to/cv.pdf',
        linkedinUrl: 'https://linkedin.com/in/testuser',
        employmentType: 'permanent',
      },
    };

    vi.mocked(loadGlobalConfig).mockReturnValue(testConfig as never);
    vi.mocked(redactSecrets).mockReturnValue({
      ...testConfig,
      global: { ...testConfig.global, llm: { ...testConfig.global.llm, apiKey: '[REDACTED]' } },
    } as never);

    const { server, getCallback } = fakeServer();
    registerReadConfig(server);
    const cb = getCallback()!;

    const result = await cb({}, { signal: AbortSignal.timeout(3000) });
    const data = JSON.parse(getTextContent(result));

    expect(data.global.llm.apiKey).toBe('[REDACTED]');
    expect(data.global.llm.model).toBe('gpt-4');
    expect(data.campaign.targetRole).toBe('senior-engineer');
    expect(data.campaign.linkedinUrl).toBe('https://linkedin.com/in/testuser');
  });

  it('handles config loading error gracefully', async () => {
    vi.mocked(loadGlobalConfig).mockImplementation(() => {
      throw new Error('Cannot read config file: "config.json" not found');
    });

    const { server, getCallback } = fakeServer();
    registerReadConfig(server);
    const cb = getCallback()!;

    const result = await cb({}, { signal: AbortSignal.timeout(3000) });

    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('Cannot read config file');
    expect(getTextContent(result)).toContain('config.json');
  });

  it('ensures sensitive data is redacted from the response', async () => {
    const configWithSecrets = {
      global: {
        apiKey: 'sk-1234567890abcdef',
        token: 'ghp_1234567890abcdef1234567890abcdef1234',
        password: 'super-secret-password',
      },
      campaign: {
        targetRole: 'test',
      },
    };

    vi.mocked(loadGlobalConfig).mockReturnValue(configWithSecrets as never);
    vi.mocked(redactSecrets).mockReturnValue({
      global: { apiKey: '[REDACTED]', token: '[REDACTED]', password: '[REDACTED]' },
      campaign: { targetRole: 'test' },
    } as never);

    const { server, getCallback } = fakeServer();
    registerReadConfig(server);
    const cb = getCallback()!;

    const result = await cb({}, { signal: AbortSignal.timeout(3000) });
    const data = JSON.parse(getTextContent(result));

    expect(data.global.apiKey).toBe('[REDACTED]');
    expect(data.global.token).toBe('[REDACTED]');
    expect(data.global.password).toBe('[REDACTED]');
  });

  it('processes empty config when file does not exist', async () => {
    vi.mocked(loadGlobalConfig).mockReturnValue({} as never);
    vi.mocked(redactSecrets).mockReturnValue({} as never);

    const { server, getCallback } = fakeServer();
    registerReadConfig(server);
    const cb = getCallback()!;

    const result = await cb({}, { signal: AbortSignal.timeout(3000) });
    const data = JSON.parse(getTextContent(result));

    expect(Object.keys(data).length).toBe(0);
    expect(data).toEqual({});
  });

  it('handles malformed config JSON gracefully', async () => {
    vi.mocked(loadGlobalConfig).mockImplementation(() => {
      throw new Error('Unexpected token }\\n at position 42 in JSON string');
    });

    const { server, getCallback } = fakeServer();
    registerReadConfig(server);
    const cb = getCallback()!;

    const result = await cb({}, { signal: AbortSignal.timeout(3000) });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('Unexpected token');
  });
});
