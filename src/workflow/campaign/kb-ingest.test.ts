import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ingestKnowledgeBase, listKnowledgeBase, syncKnowledgeBase } from './kb-ingest.js';
import { loadKnowledgeBaseContext } from './kb-context.js';
import { pathExists } from '../../core/fs.js';
import { CV_EXTENSIONS, KB_GITHUB } from '../../core/constants.js';
import { DEFAULT_MY_VOICE_FILENAME } from '../../core/paths.js';

describe('kb-ingest my-voice exclusion', () => {
  let testDir: string;
  let campaignRoot: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `jho-kb-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    campaignRoot = join(testDir, 'campaign');
    await mkdir(join(campaignRoot, 'knowledge-base'), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('skips my-voice.md when ingesting from a source directory', async () => {
    const sourceDir = join(testDir, 'source');
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, 'my-voice.md'), 'voice from source', 'utf8');
    await writeFile(join(sourceDir, 'tips.md'), 'some tips', 'utf8');

    const copied = await ingestKnowledgeBase(campaignRoot, sourceDir);

    expect(copied).toEqual(['tips.md']);
    expect(await pathExists(join(campaignRoot, 'knowledge-base', 'my-voice.md'))).toBe(false);
  });

  it('preserves my-voice.md during syncKnowledgeBase cleanup', async () => {
    const kbDir = join(campaignRoot, 'knowledge-base');
    // A voice file placed manually in the campaign KB
    await writeFile(join(kbDir, 'my-voice.md'), 'campaign voice', 'utf8');
    // A managed doc that should be cleared and re-pulled
    await writeFile(join(kbDir, 'stale.md'), 'stale doc', 'utf8');

    const sourceDir = join(testDir, 'source');
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, 'fresh.md'), 'fresh doc', 'utf8');

    const result = await syncKnowledgeBase(campaignRoot, [sourceDir]);

    expect(result).toEqual(['fresh.md']);
    expect(await readFile(join(kbDir, 'my-voice.md'), 'utf8')).toBe('campaign voice');
    expect(await pathExists(join(kbDir, 'stale.md'))).toBe(false);
  });

  it('excludes my-voice.md from the knowledge-base listing', async () => {
    const kbDir = join(campaignRoot, 'knowledge-base');
    await writeFile(join(kbDir, 'my-voice.md'), 'campaign voice', 'utf8');
    await writeFile(join(kbDir, 'tips.md'), 'some tips', 'utf8');

    const listed = await listKnowledgeBase(campaignRoot);

    expect(listed).toEqual(['tips.md']);
  });

  it('excludes my-voice.md from the LLM knowledge-base context', async () => {
    const kbDir = join(campaignRoot, 'knowledge-base');
    await writeFile(join(kbDir, 'my-voice.md'), 'campaign voice', 'utf8');
    await writeFile(join(kbDir, 'tips.md'), 'some tips', 'utf8');

    const context = await loadKnowledgeBaseContext(campaignRoot);

    expect(context).toContain('some tips');
    expect(context).not.toContain('campaign voice');
  });

  it('does not let an ingested my-voice.md overwrite an existing campaign voice file', async () => {
    const kbDir = join(campaignRoot, 'knowledge-base');
    await writeFile(join(kbDir, 'my-voice.md'), 'campaign voice', 'utf8');

    const sourceDir = join(testDir, 'source');
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, 'my-voice.md'), 'malicious source voice', 'utf8');

    await ingestKnowledgeBase(campaignRoot, sourceDir);

    expect(await readFile(join(kbDir, 'my-voice.md'), 'utf8')).toBe('campaign voice');
  });
});

describe('kb-ingest sync cleanup paths', () => {
  let testDir: string;
  let campaignRoot: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `jho-kb-sync-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    campaignRoot = join(testDir, 'campaign');
    await mkdir(join(campaignRoot, 'knowledge-base'), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('preserves JSON cache files during sync cleanup', async () => {
    const kbDir = join(campaignRoot, 'knowledge-base');
    await writeFile(join(kbDir, 'cache.json'), '{ "key": "value" }', 'utf8');
    await writeFile(join(kbDir, 'stale.md'), 'stale doc', 'utf8');

    const sourceDir = join(testDir, 'source');
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, 'fresh.md'), 'fresh doc', 'utf8');

    const result = await syncKnowledgeBase(campaignRoot, [sourceDir]);

    expect(result).toEqual(['fresh.md']);
    // JSON cache files are preserved
    expect(await readFile(join(kbDir, 'cache.json'), 'utf8')).toBe('{ "key": "value" }');
    // Stale managed docs are removed
    expect(await pathExists(join(kbDir, 'stale.md'))).toBe(false);
  });

  it('preserves non-CV files and subdirectories during sync cleanup', async () => {
    const kbDir = join(campaignRoot, 'knowledge-base');
    // Non-CV file (e.g. .log) — should be preserved (not managed)
    await writeFile(join(kbDir, 'notes.log'), 'log content', 'utf8');
    // User subdirectory — should be preserved entirely
    await mkdir(join(kbDir, 'user-docs'), { recursive: true });
    await writeFile(join(kbDir, 'user-docs', 'manual.txt'), 'user manual', 'utf8');
    // Managed doc that should be cleared
    await writeFile(join(kbDir, 'stale.md'), 'stale doc', 'utf8');

    const sourceDir = join(testDir, 'source');
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, 'fresh.md'), 'fresh doc', 'utf8');

    const result = await syncKnowledgeBase(campaignRoot, [sourceDir]);

    expect(result).toEqual(['fresh.md']);
    // Non-CV file preserved
    expect(await readFile(join(kbDir, 'notes.log'), 'utf8')).toBe('log content');
    // Subdirectory preserved
    expect(await readFile(join(kbDir, 'user-docs', 'manual.txt'), 'utf8')).toBe('user manual');
    // Stale managed doc removed
    expect(await pathExists(join(kbDir, 'stale.md'))).toBe(false);
  });

  it('preserves the github subfolder during sync cleanup', async () => {
    const kbDir = join(campaignRoot, 'knowledge-base');
    await mkdir(join(kbDir, KB_GITHUB), { recursive: true });
    await writeFile(join(kbDir, KB_GITHUB, 'README.md'), 'github readme', 'utf8');
    await writeFile(join(kbDir, 'stale.md'), 'stale doc', 'utf8');

    const sourceDir = join(testDir, 'source');
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, 'fresh.md'), 'fresh doc', 'utf8');

    const result = await syncKnowledgeBase(campaignRoot, [sourceDir]);

    expect(result).toEqual(['fresh.md']);
    // GitHub subfolder preserved
    expect(await readFile(join(kbDir, KB_GITHUB, 'README.md'), 'utf8')).toBe('github readme');
    // Stale managed doc removed
    expect(await pathExists(join(kbDir, 'stale.md'))).toBe(false);
  });

  it('warns and skips source paths that do not exist during sync', async () => {
    const sourceDir = join(testDir, 'source');
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, 'fresh.md'), 'fresh doc', 'utf8');

    const result = await syncKnowledgeBase(campaignRoot, ['/nonexistent/path']);

    expect(result).toEqual([]);
  });
});

describe('kb-ingest list and ingest edge cases', () => {
  let testDir: string;
  let campaignRoot: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `jho-kb-edge-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    campaignRoot = join(testDir, 'campaign');
    await mkdir(join(campaignRoot, 'knowledge-base'), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('lists docs recursively in subdirectories', async () => {
    const kbDir = join(campaignRoot, 'knowledge-base');
    await writeFile(join(kbDir, 'top.md'), 'top doc', 'utf8');
    await mkdir(join(kbDir, 'sub'), { recursive: true });
    await writeFile(join(kbDir, 'sub', 'nested.md'), 'nested doc', 'utf8');
    await writeFile(join(kbDir, 'sub', 'notes.json'), '{ "x": 1 }', 'utf8');

    const listed = await listKnowledgeBase(campaignRoot);

    expect(listed).toEqual(['sub/nested.md', 'top.md']);
  });

  it('excludes github subfolder and json files from listing', async () => {
    const kbDir = join(campaignRoot, 'knowledge-base');
    await writeFile(join(kbDir, 'doc1.md'), 'doc1', 'utf8');
    await writeFile(join(kbDir, 'cache.json'), '{}', 'utf8');
    await writeFile(join(kbDir, DEFAULT_MY_VOICE_FILENAME), 'voice', 'utf8');
    await mkdir(join(kbDir, KB_GITHUB), { recursive: true });
    await writeFile(join(kbDir, KB_GITHUB, 'readme.md'), 'github readme', 'utf8');

    const listed = await listKnowledgeBase(campaignRoot);

    expect(listed).toEqual(['doc1.md']);
  });

  it('skips non-CV files when ingesting from a directory', async () => {
    const sourceDir = join(testDir, 'source');
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, 'doc.md'), 'doc content', 'utf8');
    await writeFile(join(sourceDir, 'image.png'), 'binary data', 'utf8');
    await writeFile(join(sourceDir, 'data.json'), 'json data', 'utf8');

    const copied = await ingestKnowledgeBase(campaignRoot, sourceDir);

    expect(copied).toEqual(['doc.md']);
  });

  it('skips the github subfolder when ingesting from a directory', async () => {
    const sourceDir = join(testDir, 'source');
    await mkdir(sourceDir, { recursive: true });
    await writeFile(join(sourceDir, 'doc.md'), 'doc content', 'utf8');
    await mkdir(join(sourceDir, KB_GITHUB), { recursive: true });
    await writeFile(join(sourceDir, KB_GITHUB, 'readme.md'), 'github readme', 'utf8');

    const copied = await ingestKnowledgeBase(campaignRoot, sourceDir);

    expect(copied).toEqual(['doc.md']);
    expect(await pathExists(join(campaignRoot, 'knowledge-base', KB_GITHUB, 'readme.md'))).toBe(
      false,
    );
  });

  it('ingests files with all supported extensions', async () => {
    const sourceDir = join(testDir, 'source');
    await mkdir(sourceDir, { recursive: true });

    for (const ext of CV_EXTENSIONS) {
      await writeFile(join(sourceDir, `doc.${ext}`), `content for ${ext}`, 'utf8');
    }

    const copied = await ingestKnowledgeBase(campaignRoot, sourceDir);

    expect(copied).toHaveLength(CV_EXTENSIONS.length);
    for (const ext of CV_EXTENSIONS) {
      expect(copied).toContain(`doc.${ext}`);
    }
  });

  it('returns empty array when KB dir does not exist for listKnowledgeBase', async () => {
    const listed = await listKnowledgeBase(join(testDir, 'nonexistent-campaign'));
    expect(listed).toEqual([]);
  });

  it('re-scans in place when sources is empty for syncKnowledgeBase', async () => {
    const kbDir = join(campaignRoot, 'knowledge-base');
    await writeFile(join(kbDir, 'existing.md'), 'existing doc', 'utf8');

    // No sources — should just re-scan and return existing docs
    const result = await syncKnowledgeBase(campaignRoot, []);

    expect(result).toEqual(['existing.md']);
  });
});
