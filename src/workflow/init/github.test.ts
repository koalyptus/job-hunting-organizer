import { describe, expect, it, vi, beforeEach } from 'vitest';
import { promptGithub } from './github.js';
import type { GlobalConfig } from '../../core/types.js';

vi.mock('@clack/prompts', () => ({
  text: vi.fn(),
  password: vi.fn(),
  isCancel: vi.fn(),
}));

describe('promptGithub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns existing token in non-interactive mode when no override provided', async () => {
    const existingConfig: GlobalConfig = {
      version: 1,
      dataRoot: '/tmp/test',
      llm: {
        baseUrl: 'http://localhost:11434/v1',
        apiKey: 'test-key',
        model: 'test-model',
        timeoutMs: 60000,
      },
      github: {
        user: 'octocat',
        token: 'ghp_existing',
        repos: ['acme/widget'],
      },
      logging: { level: 'info', disableFileLogging: false, redactPaths: [] },
      fetch: { timeoutMs: 30000 },
    };

    const result = await promptGithub(undefined, true, existingConfig);

    expect(result.user).toBe('octocat');
    expect(result.token).toBe('ghp_existing');
  });

  it('returns undefined token in non-interactive mode when no existing config', async () => {
    const result = await promptGithub(undefined, true, null);

    expect(result.user).toBeUndefined();
    expect(result.token).toBeUndefined();
  });

  it('uses defaultUser override in non-interactive mode', async () => {
    const existingConfig: GlobalConfig = {
      version: 1,
      dataRoot: '/tmp/test',
      llm: {
        baseUrl: 'http://localhost:11434/v1',
        apiKey: 'test-key',
        model: 'test-model',
        timeoutMs: 60000,
      },
      github: {
        user: 'octocat',
        token: 'ghp_existing',
        repos: [],
      },
      logging: { level: 'info', disableFileLogging: false, redactPaths: [] },
      fetch: { timeoutMs: 30000 },
    };

    const result = await promptGithub('override-user', true, existingConfig);

    expect(result.user).toBe('override-user');
    // token still comes from existing config
    expect(result.token).toBe('ghp_existing');
  });
});
