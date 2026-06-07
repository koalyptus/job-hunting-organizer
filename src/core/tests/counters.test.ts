import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readCollisionSuffix, readCounters } from '../counters.js';

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'jho-counters-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('readCounters', () => {
  it('returns an empty record when .counters.json does not exist', () => {
    expect(readCounters(workDir)).toEqual({});
  });

  it('reads existing counters', async () => {
    await writeFile(
      join(workDir, '.counters.json'),
      JSON.stringify({ '2026-Jun-03-engineer-foo': 2 }),
      'utf8',
    );
    expect(readCounters(workDir)).toEqual({ '2026-Jun-03-engineer-foo': 2 });
  });

  it('treats malformed JSON as an empty counter set', async () => {
    await writeFile(join(workDir, '.counters.json'), '{not json', 'utf8');
    expect(readCounters(workDir)).toEqual({});
  });

  it('treats a JSON array as an empty counter set', async () => {
    await writeFile(join(workDir, '.counters.json'), '[1, 2, 3]', 'utf8');
    expect(readCounters(workDir)).toEqual({});
  });

  it('treats a JSON scalar as an empty counter set', async () => {
    await writeFile(join(workDir, '.counters.json'), '"hello"', 'utf8');
    expect(readCounters(workDir)).toEqual({});
  });

  it('drops entries that are not non-negative integers', async () => {
    await writeFile(
      join(workDir, '.counters.json'),
      JSON.stringify({
        good: 3,
        'also-good': 0,
        bad: -1,
        'bad-float': 1.5,
        'bad-string': 'x',
        'bad-null': null,
      }),
      'utf8',
    );
    expect(readCounters(workDir)).toEqual({ good: 3, 'also-good': 0 });
  });
});

describe('readCollisionSuffix', () => {
  it('returns 0 for an unseen base slug', () => {
    expect(readCollisionSuffix('2026-Jun-03-engineer-foo', workDir)).toBe(0);
  });

  it('returns the stored suffix for a seen base slug', async () => {
    await writeFile(
      join(workDir, '.counters.json'),
      JSON.stringify({ '2026-Jun-03-engineer-foo': 3 }),
      'utf8',
    );
    expect(readCollisionSuffix('2026-Jun-03-engineer-foo', workDir)).toBe(3);
  });

  it('does not modify the file on disk (pure read)', async () => {
    await writeFile(join(workDir, '.counters.json'), JSON.stringify({ a: 1 }), 'utf8');
    const before = (await import('node:fs/promises')).readFile(
      join(workDir, '.counters.json'),
      'utf8',
    );
    readCollisionSuffix('a', workDir);
    const after = (await import('node:fs/promises')).readFile(
      join(workDir, '.counters.json'),
      'utf8',
    );
    expect(await before).toEqual(await after);
  });
});
