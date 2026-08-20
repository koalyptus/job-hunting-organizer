import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ingestKnowledgeBase, listKnowledgeBase, syncKnowledgeBase } from './kb-ingest.js';
import { loadKnowledgeBaseContext } from './kb-context.js';
import { pathExists } from '../../core/fs.js';

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
