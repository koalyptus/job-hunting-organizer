import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { text, password, confirm } from '@clack/prompts';
import { detectAgents } from 'detect-local-agents';
import { runInit } from './wizard.js';
import { clearConfigCache } from '../../lib/config/config.js';

vi.mock('@clack/prompts', () => ({
  text: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(),
  isCancel: vi.fn(() => false),
  log: { info: vi.fn(), warn: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock('detect-local-agents', () => ({
  detectAgents: vi.fn(async () => []),
}));

// Keep the wizard hermetic: the profile build would otherwise fetch GitHub and
// call the LLM over the network.
vi.mock('../../core/github.js', () => ({
  fetchGithubUser: vi.fn(async (user: string) => ({ login: user, name: 'Test User' })),
  fetchGithubRepos: vi.fn(async () => []),
}));

vi.mock('../../core/llm.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    chatComplete: vi.fn(async () => ({
      content: '# Profile — Test User\n\n## Target roles\n',
      model: 'test-model',
      finishReason: 'stop',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      durationMs: 1,
    })),
  };
});

/** Read the global config written by the wizard. */
async function readGlobalConfig(testHome: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(testHome, '.jho', 'config.json'), 'utf8'));
}

describe('runInit — LLM config', () => {
  let testHome: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(async () => {
    for (const key of ['JHO_CONFIG_HOME', 'JHO_DATA', 'JHO_CV_PATH', 'JHO_LINKEDIN_URL']) {
      saved[key] = process.env[key];
    }

    testHome = await mkdtemp(join(tmpdir(), 'jho-wizard-'));
    process.env['JHO_CONFIG_HOME'] = join(testHome, '.jho');
    process.env['JHO_DATA'] = join(testHome, 'data');
    await mkdir(join(testHome, '.jho'), { recursive: true });
    clearConfigCache();
    vi.clearAllMocks();

    vi.mocked(text).mockResolvedValue('');
    vi.mocked(password).mockResolvedValue('');
    vi.mocked(confirm).mockResolvedValue(true);
  });

  afterEach(async () => {
    clearConfigCache();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    await rm(testHome, { recursive: true, force: true });
  });

  it('skips backend detection when an explicit llm.baseUrl is supplied', async () => {
    await runInit({
      name: 'skip-detect',
      llm: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      yes: false,
    });

    expect(vi.mocked(detectAgents)).not.toHaveBeenCalled();
  });

  it('still detects a backend when no explicit llm.baseUrl is supplied', async () => {
    await runInit({ name: 'do-detect', yes: false });

    expect(vi.mocked(detectAgents)).toHaveBeenCalled();
  });

  it('does not detect a backend in non-interactive mode', async () => {
    await runInit({ name: 'yes-mode', yes: true });

    expect(vi.mocked(detectAgents)).not.toHaveBeenCalled();
  });

  it('writes the supplied llm endpoint into the global config', async () => {
    await runInit({
      name: 'write-llm',
      llm: { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-x', model: 'gpt-4o-mini' },
      yes: true,
    });

    expect(await readGlobalConfig(testHome)).toMatchObject({
      llm: {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-x',
        model: 'gpt-4o-mini',
      },
    });
  });

  it('treats an empty llm.apiKey as not supplied, keeping the stored key', async () => {
    await writeFile(
      join(testHome, '.jho', 'config.json'),
      JSON.stringify({
        version: 1,
        dataRoot: join(testHome, 'data'),
        llm: {
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'sk-stored-key',
          model: 'gpt-4o-mini',
          timeoutMs: 300000,
        },
        github: { user: '', token: '', repos: [] },
        logging: { level: 'silent', file: '', redactPaths: [] },
      }),
    );
    clearConfigCache();

    await runInit({
      name: 'empty-key',
      llm: { baseUrl: 'https://api.openai.com/v1', apiKey: '' },
      yes: true,
    });

    const config = await readGlobalConfig(testHome);
    expect((config.llm as Record<string, unknown>).apiKey).toBe('sk-stored-key');
  });

  it('overrides a stored apiKey when a non-empty one is supplied', async () => {
    await writeFile(
      join(testHome, '.jho', 'config.json'),
      JSON.stringify({
        version: 1,
        dataRoot: join(testHome, 'data'),
        llm: {
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'sk-stored-key',
          model: 'gpt-4o-mini',
          timeoutMs: 300000,
        },
        github: { user: '', token: '', repos: [] },
        logging: { level: 'silent', file: '', redactPaths: [] },
      }),
    );
    clearConfigCache();

    await runInit({
      name: 'new-key',
      llm: { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-new-key' },
      yes: true,
    });

    const config = await readGlobalConfig(testHome);
    expect((config.llm as Record<string, unknown>).apiKey).toBe('sk-new-key');
  });
});
