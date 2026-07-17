import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ingestKnowledgeBase,
  syncKnowledgeBase,
  listKnowledgeBase,
} from '../../campaign/kb-ingest.js';

describe('kb-ingest', () => {
  let root: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    originalHome = process.env['HOME'];
    root = await mkdtemp(`${tmpdir()}/jho-kb-ingest-`);
    // Set HOME so homedir() returns our test root for path validation.
    process.env['HOME'] = root;
    process.env['USERPROFILE'] = root;
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    if (originalHome !== undefined) {
      process.env['HOME'] = originalHome;
    } else {
      delete process.env['HOME'];
    }
    delete process.env['USERPROFILE'];
  });

  it('ingests a single md file', async () => {
    const src = join(root, 'notes.md');
    await writeFile(src, '# hello');
    const copied = await ingestKnowledgeBase(root, src);
    expect(copied).toEqual(['notes.md']);
    const kbDir = join(root, 'knowledge-base');
    expect(await readFile(join(kbDir, 'notes.md'), 'utf8')).toBe('# hello');
  });

  it('walks a folder and skips unsupported extensions', async () => {
    const srcDir = join(root, 'src');
    await mkdir(join(srcDir, 'sub'), { recursive: true });
    await writeFile(join(srcDir, 'a.md'), 'a');
    await writeFile(join(srcDir, 'b.pdf'), '%PDF');
    await writeFile(join(srcDir, 'sub', 'c.txt'), 'c');
    await writeFile(join(srcDir, 'ignore.bin'), 'x');

    const copied = await ingestKnowledgeBase(root, srcDir);
    expect(copied.sort()).toEqual(['a.md', 'b.pdf', 'sub/c.txt']);
  });

  it('sync with empty sources re-scans the folder in place', async () => {
    const kbDir = join(root, 'knowledge-base');
    await mkdir(kbDir, { recursive: true });
    await writeFile(join(kbDir, 'manual.md'), 'manual');

    const present = await syncKnowledgeBase(root, []);
    expect(present).toEqual(['manual.md']);
    // Manual doc is preserved (not cleared).
    await expect(readFile(join(kbDir, 'manual.md'), 'utf8')).resolves.toBe('manual');
  });

  it('listKnowledgeBase returns doc relative paths, excluding github/ and json', async () => {
    const kbDir = join(root, 'knowledge-base');
    await mkdir(join(kbDir, 'github'), { recursive: true });
    await writeFile(join(kbDir, 'a.md'), 'a');
    await writeFile(join(kbDir, 'cache.json'), '{}');
    await writeFile(join(kbDir, 'github', 'user.json'), '{}');

    const listed = await listKnowledgeBase(root);
    expect(listed).toEqual(['a.md']);
  });

  it('listKnowledgeBase returns empty when folder absent', async () => {
    expect(await listKnowledgeBase(root)).toEqual([]);
  });

  it('sync clears previous user docs but keeps github/ and json', async () => {
    const kbDir = join(root, 'knowledge-base');
    await mkdir(join(kbDir, 'github'), { recursive: true });
    await writeFile(join(kbDir, 'old.md'), 'old');
    await writeFile(join(kbDir, 'cache.json'), '{}');
    await writeFile(join(kbDir, 'github', 'user.json'), '{}');

    const src = join(root, 'new.md');
    await writeFile(src, 'new');

    const copied = await syncKnowledgeBase(root, [src]);
    expect(copied).toEqual(['new.md']);

    const entries = await readdir(kbDir, { withFileTypes: true });
    const names = entries.map((e) => e.name).sort();
    expect(names).toContain('github');
    expect(names).toContain('cache.json');
    expect(names).toContain('new.md');
    expect(names).not.toContain('old.md');
  });

  it('sync skips missing source but continues', async () => {
    const src = join(root, 'present.md');
    await writeFile(src, 'p');
    const copied = await syncKnowledgeBase(root, [src, join(root, 'missing.md')]);
    expect(copied).toEqual(['present.md']);
  });
});
