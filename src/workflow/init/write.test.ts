/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/consistent-type-imports */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { writeFileSync, mkdirSync } from 'node:fs';
import * as writeModule from './write.js';
import * as kbContextModule from '../../workflow/campaign/kb-context.js';
import * as cvModule from '../../lib/cv.js';
import * as fsLib from '../../lib/fs.js';
import * as fspModule from 'node:fs/promises';
import * as clackPrompts from '@clack/prompts';
import { loadGlobalConfig, clearConfigCache, updateGlobalConfig } from '../../lib/config/config.js';
import { DEFAULT_CONFIG_FILENAME } from '../../lib/paths.js';

vi.mock('@clack/prompts', () => ({
  log: { info: vi.fn(), warn: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

const mockIngest = vi.fn();
vi.mock('../../workflow/campaign/kb-ingest.js', () => ({
  ingestKnowledgeBase: (...args: unknown[]) => mockIngest(...args),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    writeFile: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  };
});

describe('workflow/init/write branch coverage', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'jho-write2-'));
    mockIngest.mockReset();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('ingestKnowledgeBase returns empty when no kbPath (92)', async () => {
    const result = await writeModule.ingestKnowledgeBase(tmpRoot, undefined, join(tmpRoot, 'kb'));
    expect(result).toEqual([]);
    expect(mockIngest).not.toHaveBeenCalled();
  });

  it('ingestKnowledgeBase logs info when copied >0 (95-96)', async () => {
    mockIngest.mockResolvedValue(['a.pdf', 'b.md']);

    const result = await writeModule.ingestKnowledgeBase(tmpRoot, 'some/path', join(tmpRoot, 'kb'));
    expect(result.length).toBe(1);
    expect(clackPrompts.log.info).toHaveBeenCalled();
  });

  it('ingestKnowledgeBase logs warn when copied ==0 (98-99)', async () => {
    mockIngest.mockResolvedValue([]);

    const result = await writeModule.ingestKnowledgeBase(tmpRoot, 'some/path', join(tmpRoot, 'kb'));
    expect(result).toEqual([]);
    expect(clackPrompts.log.warn).toHaveBeenCalled();
  });

  it('scaffoldVoiceGuide early return when exists (109-110)', async () => {
    vi.spyOn(fsLib, 'pathExists').mockResolvedValue(true);

    await writeModule.scaffoldVoiceGuide(tmpRoot);
    // should not call writeFile

    expect(vi.mocked(fspModule.writeFile)).not.toHaveBeenCalled();
  });

  it('scaffoldVoiceGuide fail-soft when writeFile throws (117-120)', async () => {
    vi.spyOn(fsLib, 'pathExists').mockResolvedValue(false);

    vi.mocked(fspModule.writeFile).mockRejectedValue(new Error('EACCES'));

    await writeModule.scaffoldVoiceGuide(tmpRoot);
    expect(clackPrompts.log.warn).toHaveBeenCalled();
  });
});

describe('writeInitGlobalConfig preserves existing fields', () => {
  let tmpRoot: string;
  let originalConfigHome: string | undefined;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'jho-init-preserve-'));
    originalConfigHome = process.env['JHO_CONFIG_HOME'];
    process.env['JHO_CONFIG_HOME'] = join(tmpRoot, '.jho-config');
    mkdirSync(process.env['JHO_CONFIG_HOME']!, { recursive: true });
    clearConfigCache();
  });

  afterEach(async () => {
    if (originalConfigHome === undefined) {
      delete process.env['JHO_CONFIG_HOME'];
    } else {
      process.env['JHO_CONFIG_HOME'] = originalConfigHome;
    }
    clearConfigCache();
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('preserves github.token, github.repos, and llm.tags on re-init', async () => {
    // Seed a config with a token, repos, and tags
    const configPath = join(process.env['JHO_CONFIG_HOME']!, DEFAULT_CONFIG_FILENAME);
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        dataRoot: '/tmp/test-data',
        llm: {
          baseUrl: 'http://localhost:11434/v1',
          apiKey: 'test-key',
          model: 'test-model',
          timeoutMs: 60000,
          tags: ['user=jho'],
        },
        github: {
          user: 'octocat',
          token: 'ghp_test123',
          repos: ['acme/widget'],
        },
        logging: { level: 'info', disableFileLogging: false, redactPaths: [] },
        fetch: { timeoutMs: 30000 },
      }),
      'utf8',
    );
    clearConfigCache();

    // Simulate a bare init call (non-interactive, no github/llm overrides)
    writeModule.writeInitGlobalConfig('/tmp/test-data', {}, { user: undefined, token: undefined });

    const config = loadGlobalConfig();
    expect(config.github.token).toBe('ghp_test123');
    expect(config.github.repos).toEqual(['acme/widget']);
    expect(config.llm.tags).toEqual(['user=jho']);
  });

  it('preserves github.user when not overridden', async () => {
    const configPath = join(process.env['JHO_CONFIG_HOME']!, DEFAULT_CONFIG_FILENAME);
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        dataRoot: '/tmp/test-data',
        llm: {
          baseUrl: 'http://localhost:11434/v1',
          apiKey: 'test-key',
          model: 'test-model',
          timeoutMs: 60000,
        },
        github: {
          user: 'existing-user',
          token: 'ghp_existing',
          repos: [],
        },
        logging: { level: 'info', disableFileLogging: false, redactPaths: [] },
        fetch: { timeoutMs: 30000 },
      }),
      'utf8',
    );
    clearConfigCache();

    writeModule.writeInitGlobalConfig('/tmp/test-data', {}, { user: undefined, token: undefined });

    const config = loadGlobalConfig();
    expect(config.github.user).toBe('existing-user');
    expect(config.github.token).toBe('ghp_existing');
  });

  it('uses new values when explicitly provided', async () => {
    const configPath = join(process.env['JHO_CONFIG_HOME']!, DEFAULT_CONFIG_FILENAME);
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        dataRoot: '/tmp/test-data',
        llm: {
          baseUrl: 'http://localhost:11434/v1',
          apiKey: 'test-key',
          model: 'test-model',
          timeoutMs: 60000,
          tags: ['user=jho'],
        },
        github: {
          user: 'old-user',
          token: 'ghp_old',
          repos: ['old/repo'],
        },
        logging: { level: 'info', disableFileLogging: false, redactPaths: [] },
        fetch: { timeoutMs: 30000 },
      }),
      'utf8',
    );
    clearConfigCache();

    writeModule.writeInitGlobalConfig('/tmp/test-data', {}, { user: 'new-user', token: 'ghp_new' });

    const config = loadGlobalConfig();
    expect(config.github.user).toBe('new-user');
    expect(config.github.token).toBe('ghp_new');
    // repos and tags are still preserved from existing config
    expect(config.github.repos).toEqual(['old/repo']);
    expect(config.llm.tags).toEqual(['user=jho']);
  });
});
