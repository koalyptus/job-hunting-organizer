import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import {
  indexPath,
  readIndex,
  writeIndex,
  buildIndex,
  rebuildIndex,
  upsertIndexEntry,
  removeIndexEntry,
} from '../../applications/index.js';
import type { ApplicationEntry } from '../../applications/types.js';

let workDir: string;
let appliedDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'jho-idx-'));
  appliedDir = join(workDir, 'applied');
  await mkdir(appliedDir, { recursive: true });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

function makeEntry(overrides: Partial<ApplicationEntry> = {}): ApplicationEntry {
  return {
    slug: '2026-Jun-03-SE-Foo-123',
    status: 'applied',
    title: 'Software Engineer',
    company: 'Foo Inc',
    site: 'Seek',
    targetRole: 'senior-backend-engineer',
    appliedOn: '2026-06-03',
    tags: ['typescript'],
    ...overrides,
  };
}

describe('indexPath', () => {
  it('resolves to .index.json inside the applied dir', () => {
    expect(indexPath(appliedDir)).toBe(join(appliedDir, '.index.json'));
  });
});

describe('readIndex', () => {
  it('returns empty array when index file does not exist', async () => {
    const result = await readIndex(appliedDir);
    expect(result).toEqual([]);
  });

  it('returns empty array when file is not valid JSON', async () => {
    await writeFile(indexPath(appliedDir), 'not json', 'utf8');
    const result = await readIndex(appliedDir);
    expect(result).toEqual([]);
  });

  it('returns empty array when file is not an array', async () => {
    await writeFile(indexPath(appliedDir), '{"foo": "bar"}', 'utf8');
    const result = await readIndex(appliedDir);
    expect(result).toEqual([]);
  });

  it('reads a valid index file', async () => {
    const entries = [makeEntry()];
    await writeIndex(appliedDir, entries);
    const result = await readIndex(appliedDir);
    expect(result).toHaveLength(1);
    expect(result[0]!.slug).toBe('2026-Jun-03-SE-Foo-123');
  });

  it('drops entries with invalid slugs', async () => {
    const entries = [makeEntry(), makeEntry({ slug: 'invalid-slug' })];
    await writeIndex(appliedDir, entries);
    const result = await readIndex(appliedDir);
    expect(result).toHaveLength(1);
  });
});

describe('writeIndex', () => {
  it('returns true on success', async () => {
    const result = await writeIndex(appliedDir, [makeEntry()]);
    expect(result).toBe(true);
  });

  it('writes entries sorted by slug descending (newest first)', async () => {
    const entries = [
      makeEntry({ slug: '2026-Jan-01-SE-A-1' }),
      makeEntry({ slug: '2026-Jun-03-SE-B-2' }),
      makeEntry({ slug: '2026-Mar-15-SE-C-3' }),
    ];
    await writeIndex(appliedDir, entries);
    const result = await readIndex(appliedDir);
    expect(result.map((e) => e.slug)).toEqual([
      '2026-Jun-03-SE-B-2',
      '2026-Mar-15-SE-C-3',
      '2026-Jan-01-SE-A-1',
    ]);
  });

  it('creates the applied directory if it does not exist', async () => {
    const newDir = join(workDir, 'new-applied');
    await writeIndex(newDir, [makeEntry()]);
    const result = await readIndex(newDir);
    expect(result).toHaveLength(1);
  });
});

describe('buildIndex', () => {
  it('returns empty array for non-existent directory', async () => {
    const result = await buildIndex(join(workDir, 'nonexistent'));
    expect(result).toEqual([]);
  });

  it('scans folders and reads meta.md frontmatter', async () => {
    const folder = join(appliedDir, '2026-Jun-03-SE-Foo-123');
    await mkdir(folder, { recursive: true });
    const metaContent = [
      '---',
      'slug: 2026-Jun-03-SE-Foo-123',
      'status: applied',
      'appliedOn: 2026-06-03',
      'title: Software Engineer',
      'company: Foo Inc',
      'site: Seek',
      'targetRole: senior-backend-engineer',
      'tags:',
      '  - typescript',
      '---',
      '',
      '# Notes',
      '',
    ].join('\n');
    await writeFile(join(folder, 'meta.md'), metaContent, 'utf8');

    const result = await buildIndex(appliedDir);
    expect(result).toHaveLength(1);
    expect(result[0]!.slug).toBe('2026-Jun-03-SE-Foo-123');
    expect(result[0]!.title).toBe('Software Engineer');
    expect(result[0]!.tags).toEqual(['typescript']);
  });

  it('skips folders that do not match slug pattern', async () => {
    await mkdir(join(appliedDir, 'not-a-slug'), { recursive: true });
    await mkdir(join(appliedDir, '.counters.json'), { recursive: true });
    const result = await buildIndex(appliedDir);
    expect(result).toHaveLength(0);
  });

  it('skips folders without valid meta.md', async () => {
    await mkdir(join(appliedDir, '2026-Jun-03-SE-Foo-123'), { recursive: true });
    const result = await buildIndex(appliedDir);
    expect(result).toHaveLength(0);
  });
});

describe('rebuildIndex', () => {
  it('builds and writes the index, returns entries', async () => {
    const folder = join(appliedDir, '2026-Jun-03-SE-Foo-123');
    await mkdir(folder, { recursive: true });
    const metaContent = [
      '---',
      'slug: 2026-Jun-03-SE-Foo-123',
      'status: interview',
      'appliedOn: 2026-06-03',
      '---',
      '',
    ].join('\n');
    await writeFile(join(folder, 'meta.md'), metaContent, 'utf8');

    const result = await rebuildIndex(appliedDir);
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('interview');

    const written = await readIndex(appliedDir);
    expect(written).toHaveLength(1);
  });
});

describe('upsertIndexEntry', () => {
  it('returns true on success', async () => {
    const result = await upsertIndexEntry(appliedDir, makeEntry());
    expect(result).toBe(true);
  });

  it('adds a new entry', async () => {
    await upsertIndexEntry(appliedDir, makeEntry());
    const result = await readIndex(appliedDir);
    expect(result).toHaveLength(1);
  });

  it('updates an existing entry by slug', async () => {
    await upsertIndexEntry(appliedDir, makeEntry());
    await upsertIndexEntry(appliedDir, makeEntry({ status: 'interview' }));
    const result = await readIndex(appliedDir);
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe('interview');
  });
});

describe('removeIndexEntry', () => {
  it('returns true when entry is removed', async () => {
    await upsertIndexEntry(appliedDir, makeEntry());
    const result = await removeIndexEntry(appliedDir, '2026-Jun-03-SE-Foo-123');
    expect(result).toBe(true);
  });

  it('removes an entry by slug', async () => {
    await upsertIndexEntry(appliedDir, makeEntry());
    await removeIndexEntry(appliedDir, '2026-Jun-03-SE-Foo-123');
    const result = await readIndex(appliedDir);
    expect(result).toHaveLength(0);
  });

  it('returns false when slug does not exist', async () => {
    await upsertIndexEntry(appliedDir, makeEntry());
    const result = await removeIndexEntry(appliedDir, 'nonexistent');
    expect(result).toBe(false);
  });

  it('is a no-op when slug does not exist', async () => {
    await upsertIndexEntry(appliedDir, makeEntry());
    await removeIndexEntry(appliedDir, 'nonexistent');
    const result = await readIndex(appliedDir);
    expect(result).toHaveLength(1);
  });
});
