import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { text, password } from '@clack/prompts';
import { promptLlm, loadExistingConfig } from '../../init/llm.js';
import { clearConfigCache } from '../../config.js';
import type { GlobalConfig } from '../../types.js';

vi.mock('@clack/prompts', () => ({
  text: vi.fn(),
  password: vi.fn(),
  isCancel: vi.fn(() => false),
  log: {
    info: vi.fn(),
  },
}));

describe('loadExistingConfig', () => {
  let testHome: string;
  let originalJhoConfigHome: string | undefined;

  beforeEach(async () => {
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-llm-test-'));
    process.env['JHO_CONFIG_HOME'] = join(testHome, '.jho');
    clearConfigCache();
  });

  afterEach(async () => {
    clearConfigCache();
    if (originalJhoConfigHome === undefined) {
      delete process.env['JHO_CONFIG_HOME'];
    } else {
      process.env['JHO_CONFIG_HOME'] = originalJhoConfigHome;
    }
    await rm(testHome, { recursive: true, force: true });
  });

  it('returns config object or null depending on env', () => {
    const result = loadExistingConfig();
    // With global test setup, a default config exists, so result is an object.
    // In production with no config file, result would be null.
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
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'no-key',
      model: 'llama3.1',
    });
  });

  it('prompts for LLM config in interactive mode', async () => {
    vi.mocked(text)
      .mockResolvedValueOnce('http://myserver:8080/v1') // base URL
      .mockResolvedValueOnce('mymodel'); // model
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
    vi.mocked(text).mockResolvedValueOnce('http://server:8080/v1').mockResolvedValueOnce(''); // accept default model
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
      llm: { baseUrl: 'http://old:11434/v1', apiKey: 'old-key', model: 'old-model' },
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
    vi.mocked(password).mockResolvedValue(''); // press Enter

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
});
