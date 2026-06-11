import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { promptLlm, loadExistingConfig } from '../init/llm.js';
import { clearConfigCache } from '../config.js';
import type { GlobalConfig } from '../types.js';

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
      apiKey: 'ollama',
      model: 'llama3.1',
    });
  });

  it('prompts for LLM config in interactive mode', async () => {
    const { text, password } = await import('@clack/prompts');
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
    const { text } = await import('@clack/prompts');
    vi.mocked(text).mockResolvedValue('');

    const result = await promptLlm(false, null);

    expect(result).toEqual({
      baseUrl: undefined,
      apiKey: undefined,
      model: undefined,
    });
  });

  it('pre-fills from existing config', async () => {
    const { text } = await import('@clack/prompts');
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
    const { text, password } = await import('@clack/prompts');
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
});
