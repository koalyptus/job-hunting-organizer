import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStore } from '../local/factory.js';
import { StorageNotFoundError } from '../types.js';

/**
 * Storage integration smoke gate — proves the wired LocalFileStore reads and
 * writes a real on-disk layout that mirrors the campaign tree described in
 * docs/PLAN.md (applied/, knowledge-base/, profile.md), without touching the
 * user's real data root.
 *
 * The fixture is hand-authored placeholder content (no PII); each test copies
 * it into a fresh `fs.mkdtemp` dir and constructs the store with an explicit
 * root so no env-var resolution can land on the real
 * `~/.job-hunting-organizer-data`.
 */
describe('FileStore smoke (real-data layout, disposable temp root)', () => {
  let tempDir: string;
  let fixtureDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'jho-smoke-'));
    const here = dirname(fileURLToPath(import.meta.url));
    fixtureDir = resolve(here, 'fixtures/smoke-data');
    await cp(fixtureDir, tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('read', () => {
    it('reads a UTF-8 file from the wired layout', async () => {
      const store = createStore(tempDir);
      const meta = await store.read('applied/2026-Jan-15-SE-ACME-Corp-sample-role/meta.md');
      expect(meta).toContain('ACME Corp');
      expect(meta).toContain('Sample Engineer');
    });

    it('reads the root-level profile.md', async () => {
      const store = createStore(tempDir);
      const profile = await store.read('profile.md');
      expect(profile).toContain('Profile');
    });

    it('throws StorageNotFoundError for a missing file', async () => {
      const store = createStore(tempDir);
      await expect(store.read('applied/does-not-exist/meta.md')).rejects.toBeInstanceOf(
        StorageNotFoundError,
      );
    });
  });

  describe('readBytes', () => {
    it('reads raw bytes whose decoded text matches the fixture', async () => {
      const store = createStore(tempDir);
      const bytes = await store.readBytes('applied/2026-Jan-15-SE-ACME-Corp-sample-role/jd.md');
      const decoded = new TextDecoder().decode(bytes);
      expect(decoded).toContain('Sample Engineer');
    });

    it('throws StorageNotFoundError for a missing file', async () => {
      const store = createStore(tempDir);
      await expect(store.readBytes('applied/does-not-exist/jd.md')).rejects.toBeInstanceOf(
        StorageNotFoundError,
      );
    });
  });

  describe('exists', () => {
    it('returns true for a real fixture path', async () => {
      const store = createStore(tempDir);
      expect(await store.exists('applied/2026-Jan-15-SE-ACME-Corp-sample-role/meta.md')).toBe(true);
    });

    it('returns false for a non-existent path', async () => {
      const store = createStore(tempDir);
      expect(await store.exists('applied/does-not-exist/meta.md')).toBe(false);
    });

    it('returns true for a directory entry', async () => {
      const store = createStore(tempDir);
      expect(await store.exists('applied/2026-Jan-15-SE-ACME-Corp-sample-role')).toBe(true);
    });
  });

  describe('stat', () => {
    it('returns kind=directory and a Date mtime for a directory', async () => {
      const store = createStore(tempDir);
      const dirStat = await store.stat('applied/2026-Jan-15-SE-ACME-Corp-sample-role');
      expect(dirStat.kind).toBe('directory');
      expect(dirStat.mtime).toBeInstanceOf(Date);
      expect(Number.isFinite(dirStat.mtime.getTime())).toBe(true);
    });

    it('returns kind=file for a file', async () => {
      const store = createStore(tempDir);
      const fileStat = await store.stat('applied/2026-Jan-15-SE-ACME-Corp-sample-role/meta.md');
      expect(fileStat.kind).toBe('file');
      expect(fileStat.size).toBeGreaterThan(0);
    });

    it('throws StorageNotFoundError for a missing path', async () => {
      const store = createStore(tempDir);
      await expect(store.stat('applied/missing-role/meta.md')).rejects.toBeInstanceOf(
        StorageNotFoundError,
      );
    });
  });

  describe('readdir', () => {
    it('lists applied/ entries including the slug-conforming fixture folder', async () => {
      const store = createStore(tempDir);
      const entries = await store.readdir('applied');
      // The fixture folder name matches SLUG_PATTERN, so it mirrors a real
      // application directory the CLI would recognise via cwd inference.
      expect(entries).toContain('2026-Jan-15-SE-ACME-Corp-sample-role');
      // Documented contract: readdir filters '.' and '..' by default, so the
      // returned set is exactly the real entries (no special entries).
      expect(entries.sort()).toEqual(['2026-Jan-15-SE-ACME-Corp-sample-role']);
    });

    it('lists knowledge-base/ entries including notes.md', async () => {
      const store = createStore(tempDir);
      const entries = await store.readdir('knowledge-base');
      expect(entries).toContain('notes.md');
    });

    it('returns the data root when path is empty', async () => {
      const store = createStore(tempDir);
      const entries = await store.readdir('');
      expect(entries).toContain('applied');
      expect(entries).toContain('knowledge-base');
      expect(entries).toContain('profile.md');
    });

    it('returns [] for a missing directory (per contract)', async () => {
      const store = createStore(tempDir);
      expect(await store.readdir('does-not-exist-dir')).toEqual([]);
    });
  });

  describe('withLock', () => {
    it('resolves with the critical section return value', async () => {
      const store = createStore(tempDir);
      const result = await store.withLock('smoke', async () => 'locked-ok');
      expect(result).toBe('locked-ok');
    });

    it('runs the critical section and releases the lock', async () => {
      const store = createStore(tempDir);
      let ran = false;
      await store.withLock('smoke-flag', async () => {
        ran = true;
      });
      expect(ran).toBe(true);
    });

    it('serializes concurrent holders of the same key', async () => {
      const store = createStore(tempDir);
      const order: number[] = [];
      const make = (n: number) =>
        store.withLock('concurrent-smoke', async () => {
          order.push(n);
          await new Promise((r) => setTimeout(r, 15));
          order.push(n * 10);
        });
      await Promise.all([make(1), make(2), make(3)]);
      for (let i = 0; i < order.length; i += 2) {
        const entry = order[i]!;
        const exit = order[i + 1]!;
        expect(exit).toBe(entry * 10);
      }
    });
  });

  describe('root confinement', () => {
    it('rejects a ".." escape from the temp root', async () => {
      const store = createStore(tempDir);
      await expect(store.read('../escape.md')).rejects.toThrow(/no '\.\.'/);
    });

    it('rejects a leading-slash absolute path', async () => {
      const store = createStore(tempDir);
      await expect(store.read('/etc/passwd')).rejects.toThrow();
    });

    it('rejects a Windows drive-letter path', async () => {
      const store = createStore(tempDir);
      await expect(store.read('C:/windows.txt')).rejects.toThrow();
    });
  });

  describe('factory and getDataRoot', () => {
    it('createStore(tempDir) anchors the store at the temp root', () => {
      const store = createStore(tempDir);
      expect(store.getDataRoot()).toBe(tempDir);
    });

    it('createStore(tempDir) returns a fresh instance per call', () => {
      const s1 = createStore(tempDir);
      const s2 = createStore(tempDir);
      expect(s1).not.toBe(s2);
      expect(s1.getDataRoot()).toBe(tempDir);
      expect(s2.getDataRoot()).toBe(tempDir);
    });
  });

  describe('write round-trip', () => {
    it('writes a new file under the temp root and reads it back', async () => {
      const store = createStore(tempDir);
      await store.write(
        'applied/2026-Jan-15-SE-ACME-Corp-sample-role/notes.md',
        'placeholder write',
      );
      const got = await store.read('applied/2026-Jan-15-SE-ACME-Corp-sample-role/notes.md');
      expect(got).toBe('placeholder write');
    });

    it('creates parent directories on a deep write', async () => {
      const store = createStore(tempDir);
      await store.write('applied/new-role/notes.md', 'x');
      const fileStat = await store.stat('applied/new-role/notes.md');
      expect(fileStat.kind).toBe('file');
    });
  });
});
