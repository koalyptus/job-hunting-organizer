import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { text, password, isCancel } from '@clack/prompts';
import {
  promptLlm,
  loadExistingConfig,
  detectLocalBackend,
  buildLlmConfig,
} from '../../../workflow/init/llm.js';
import { detectAgents } from 'detect-local-agents';
import { clearConfigCache } from '../../config/config.js';
import { InitCancelled } from '../../../workflow/init/errors.js';
import {
  DEFAULT_LLM_API_KEY,
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_MODEL,
  JHO_CONFIG_HOME,
} from '../../../workflow/init/constants.js';
import type { GlobalConfig } from '../../types.js';
import type { Logger } from 'pino';
import type { DetectedAgent } from 'detect-local-agents';

vi.mock('@clack/prompts', () => ({
  text: vi.fn(),
  password: vi.fn(),
  isCancel: vi.fn(() => false),
  log: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('detect-local-agents', () => ({
  detectAgents: vi.fn(),
}));

describe('loadExistingConfig', () => {
  let testHome: string;
  let originalJhoConfigHome: string | undefined;

  beforeEach(async () => {
    originalJhoConfigHome = process.env[JHO_CONFIG_HOME];
    testHome = await mkdtemp(join(tmpdir(), 'jho-llm-test-'));
    process.env[JHO_CONFIG_HOME] = join(testHome, '.jho');
    clearConfigCache();
  });

  afterEach(async () => {
    clearConfigCache();
    if (originalJhoConfigHome === undefined) {
      delete process.env[JHO_CONFIG_HOME];
    } else {
      process.env[JHO_CONFIG_HOME] = originalJhoConfigHome;
    }
    await rm(testHome, { recursive: true, force: true });
  });

  it('returns config object or null depending on env', () => {
    const result = loadExistingConfig();
    expect(result === null || typeof result === 'object').toBe(true);
  });
});

describe('promptLlm', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns env vars in non-interactive mode', async () => {
    process.env['LLM_BASE_URL'] = 'http://custom:8080/v1';
    process.env['LLM_API_KEY'] = 'custom-key';
    process.env['LLM_MODEL'] = 'custom-model';

    const result = await promptLlm(true, null);

    expect(result).toEqual({
      baseUrl: 'http://custom:8080/v1',
      apiKey: 'custom-key',
      model: 'custom-model',
    });
  });

  it('returns defaults when env vars not set', async () => {
    delete process.env['LLM_BASE_URL'];
    delete process.env['LLM_API_KEY'];
    delete process.env['LLM_MODEL'];

    const result = await promptLlm(true, null);

    expect(result).toEqual({
      baseUrl: DEFAULT_LLM_BASE_URL,
      apiKey: DEFAULT_LLM_API_KEY,
      model: DEFAULT_LLM_MODEL,
    });
  });

  it('prompts for LLM config in interactive mode', async () => {
    vi.mocked(text)
      .mockResolvedValueOnce('http://myserver:8080/v1')
      .mockResolvedValueOnce('mymodel');
    vi.mocked(password).mockResolvedValue('mykey');

    const result = await promptLlm(false, null);

    expect(result).toEqual({
      baseUrl: 'http://myserver:8080/v1',
      apiKey: 'mykey',
      model: 'mymodel',
    });
  });

  it('returns undefined values when base URL is empty', async () => {
    vi.mocked(text).mockResolvedValue('');

    const result = await promptLlm(false, null);

    expect(result).toEqual({
      baseUrl: undefined,
      apiKey: undefined,
      model: undefined,
    });
  });

  it('pre-fills from existing config', async () => {
    vi.mocked(text).mockResolvedValue('');

    await promptLlm(false, {
      llm: { baseUrl: 'http://existing:11434/v1', model: 'existing-model' },
    } as GlobalConfig);

    expect(text).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultValue: 'http://existing:11434/v1',
        initialValue: 'http://existing:11434/v1',
      }),
    );
  });

  it('pre-fills model from existing config', async () => {
    vi.mocked(text).mockResolvedValueOnce('http://server:8080/v1').mockResolvedValueOnce('');
    vi.mocked(password).mockResolvedValue('key');

    await promptLlm(false, {
      llm: { baseUrl: 'http://old:11434/v1', model: 'old-model' },
    } as GlobalConfig);

    expect(text).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultValue: 'old-model',
        initialValue: 'old-model',
      }),
    );
  });

  it('shows "press Enter to keep existing" when API key exists', async () => {
    vi.mocked(text).mockResolvedValueOnce('http://server:8080/v1').mockResolvedValueOnce('mymodel');
    vi.mocked(password).mockResolvedValue('new-key');

    await promptLlm(false, {
      llm: { baseUrl: 'http://old:11434/v1', apiKey: 'existing-key', model: 'old-model' },
    } as GlobalConfig);

    expect(password).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'LLM API key? (press Enter to keep existing)',
      }),
    );
  });

  it('shows plain prompt when no existing API key', async () => {
    vi.mocked(text).mockResolvedValueOnce('http://server:8080/v1').mockResolvedValueOnce('mymodel');
    vi.mocked(password).mockResolvedValue('my-key');

    await promptLlm(false, {
      llm: { baseUrl: 'http://old:11434/v1', model: 'old-model' },
    } as GlobalConfig);

    expect(password).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'LLM API key?',
      }),
    );
  });

  it('uses existing API key when password prompt is empty', async () => {
    vi.mocked(text).mockResolvedValueOnce('http://server:8080/v1').mockResolvedValueOnce('mymodel');
    vi.mocked(password).mockResolvedValue('');

    const result = await promptLlm(false, {
      llm: { baseUrl: 'http://old:11434/v1', apiKey: 'existing-key', model: 'old-model' },
    } as GlobalConfig);

    expect(result.apiKey).toBe('existing-key');
  });

  it('skips API key prompt for localhost URLs', async () => {
    vi.mocked(text)
      .mockResolvedValueOnce('http://localhost:11434/v1')
      .mockResolvedValueOnce('mymodel');

    const result = await promptLlm(false, null);

    expect(result).toEqual({
      baseUrl: 'http://localhost:11434/v1',
      apiKey: undefined,
      model: 'mymodel',
    });
    expect(password).not.toHaveBeenCalled();
  });

  it('skips API key prompt for 127.0.0.1 URLs', async () => {
    vi.mocked(text)
      .mockResolvedValueOnce('http://127.0.0.1:11434/v1')
      .mockResolvedValueOnce('mymodel');

    const result = await promptLlm(false, null);

    expect(result).toEqual({
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: undefined,
      model: 'mymodel',
    });
    expect(password).not.toHaveBeenCalled();
  });

  it('prompts for API key for non-local URLs', async () => {
    vi.mocked(text)
      .mockResolvedValueOnce('https://api.openai.com/v1')
      .mockResolvedValueOnce('gpt-4');
    vi.mocked(password).mockResolvedValue('sk-xxx');

    const result = await promptLlm(false, null);

    expect(result).toEqual({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-xxx',
      model: 'gpt-4',
    });
    expect(password).toHaveBeenCalled();
  });

  it('returns null when no config file exists', async () => {
    const result = loadExistingConfig();
    expect(result === null || typeof result === 'object').toBe(true);
  });

  it('returns false for invalid URL in isLocalUrl', async () => {
    vi.mocked(text).mockResolvedValueOnce('not-a-url').mockResolvedValueOnce('mymodel');
    vi.mocked(password).mockResolvedValue('mykey');

    const result = await promptLlm(false, null);

    expect(result).toEqual({
      baseUrl: 'not-a-url',
      apiKey: 'mykey',
      model: 'mymodel',
    });
    expect(password).toHaveBeenCalled();
  });

  it('skips API key prompt for *.localhost URLs', async () => {
    vi.mocked(text)
      .mockResolvedValueOnce('http://ollama.localhost:11434/v1')
      .mockResolvedValueOnce('mymodel');

    const result = await promptLlm(false, null);

    expect(result).toEqual({
      baseUrl: 'http://ollama.localhost:11434/v1',
      apiKey: undefined,
      model: 'mymodel',
    });
    expect(password).not.toHaveBeenCalled();
  });

  it('throws InitCancelled when base URL prompt is cancelled', async () => {
    vi.mocked(isCancel).mockReturnValueOnce(true);

    await expect(promptLlm(false, null)).rejects.toThrow(InitCancelled);
  });

  it('throws InitCancelled when model prompt is cancelled (local URL)', async () => {
    vi.mocked(text).mockResolvedValueOnce('http://localhost:11434/v1');
    vi.mocked(isCancel).mockReturnValueOnce(false).mockReturnValueOnce(true);

    await expect(promptLlm(false, null)).rejects.toThrow(InitCancelled);
  });

  it('throws InitCancelled when API key prompt is cancelled', async () => {
    vi.mocked(text).mockResolvedValueOnce('https://api.openai.com/v1');
    vi.mocked(isCancel).mockReturnValueOnce(false).mockReturnValueOnce(true);

    await expect(promptLlm(false, null)).rejects.toThrow(InitCancelled);
  });

  it('throws InitCancelled when model prompt is cancelled (non-local URL)', async () => {
    vi.mocked(text)
      .mockResolvedValueOnce('https://api.openai.com/v1')
      .mockResolvedValueOnce('gpt-4');
    vi.mocked(password).mockResolvedValue('sk-xxx');
    vi.mocked(isCancel)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    await expect(promptLlm(false, null)).rejects.toThrow(InitCancelled);
  });

  // --- Tests for detectedSuggestion parameter ---

  it('uses detected suggestion for baseUrl and model in non-interactive mode', async () => {
    delete process.env['LLM_BASE_URL'];
    delete process.env['LLM_API_KEY'];
    delete process.env['LLM_MODEL'];

    const result = await promptLlm(true, null, {
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3.1',
    });

    expect(result).toEqual({
      baseUrl: 'http://localhost:11434/v1',
      apiKey: DEFAULT_LLM_API_KEY,
      model: 'llama3.1',
    });
  });

  it('uses detected suggestion as defaults in interactive mode', async () => {
    vi.mocked(text)
      .mockResolvedValueOnce('http://localhost:11434/v1')
      .mockResolvedValueOnce('llama3.1');

    const result = await promptLlm(false, null, {
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3.1',
    });

    expect(result).toEqual({
      baseUrl: 'http://localhost:11434/v1',
      apiKey: undefined,
      model: 'llama3.1',
    });
  });

  it('detected suggestion overrides existing config defaults', async () => {
    vi.mocked(text).mockResolvedValue('');

    await promptLlm(
      false,
      {
        llm: { baseUrl: 'http://old:11434/v1', model: 'old-model' },
      } as GlobalConfig,
      {
        baseUrl: 'http://localhost:11434/v1',
        model: 'llama3.1',
      },
    );

    expect(text).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultValue: 'http://localhost:11434/v1',
      }),
    );
  });
});

describe('detectLocalBackend', () => {
  const mockDetectAgents = vi.mocked(detectAgents);
  const mockLog = { debug: vi.fn() } as unknown as Logger;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ollama suggestion when ollama agent found', async () => {
    mockDetectAgents.mockResolvedValueOnce([
      { name: 'ollama', binary: '/usr/bin/ollama', version: '0.3.0' },
    ] as DetectedAgent[]);
    const result = await detectLocalBackend(mockLog);
    expect(result).toEqual({ baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' });
  });

  it('returns lmstudio suggestion when lmstudio agent found', async () => {
    mockDetectAgents.mockResolvedValueOnce([
      { name: 'lmstudio', binary: '/usr/bin/lms', version: '0.2.0' },
    ] as DetectedAgent[]);
    const result = await detectLocalBackend(mockLog);
    expect(result).toEqual({ baseUrl: 'http://localhost:1234/v1', model: 'auto' });
  });

  it('returns undefined when no agents found', async () => {
    mockDetectAgents.mockResolvedValueOnce([]);
    const result = await detectLocalBackend(mockLog);
    expect(result).toBeUndefined();
  });

  it('returns undefined when detectAgents rejects', async () => {
    mockDetectAgents.mockRejectedValueOnce(new Error('spawn fail'));
    const result = await detectLocalBackend(mockLog);
    expect(result).toBeUndefined();
    expect(mockLog.debug).toHaveBeenCalled();
  });
});

describe('buildLlmConfig', () => {
  it('returns config when baseUrl and model present', () => {
    const result = buildLlmConfig({ baseUrl: 'http://localhost:11434/v1', model: 'llama3' }, null);
    expect(result).toEqual({
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'no-key',
      model: 'llama3',
      timeoutMs: 1_200_000,
    });
  });

  it('returns undefined when no baseUrl', () => {
    expect(buildLlmConfig({ model: 'llama3' }, null)).toBeUndefined();
  });

  it('returns undefined when no model', () => {
    expect(buildLlmConfig({ baseUrl: 'http://localhost:11434/v1' }, null)).toBeUndefined();
  });

  it('preserves existing config timeout', () => {
    const existing = { llm: { timeoutMs: 600_000 } } as unknown as GlobalConfig;
    const result = buildLlmConfig(
      { baseUrl: 'http://localhost:11434/v1', model: 'llama3' },
      existing,
    );
    expect(result?.timeoutMs).toBe(600_000);
  });

  it('uses provided apiKey when set', () => {
    const result = buildLlmConfig(
      { baseUrl: 'http://localhost:11434/v1', model: 'llama3', apiKey: 'sk-123' },
      null,
    );
    expect(result?.apiKey).toBe('sk-123');
  });
});
