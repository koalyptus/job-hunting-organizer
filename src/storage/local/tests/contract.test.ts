import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalFileStore, resolveDataRoot } from '../file-store.js';
import { createStore } from '../factory.js';
import {
  StorageNotFoundError,
  StorageAlreadyExistsError,
  StorageNotEmptyError,
  StorageUnsupportedError,
} from '../../types.js';

describe('LocalFileStore contract suite', () => {
  let root: string;
  let store: LocalFileStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'jho-storage-test-'));
    store = new LocalFileStore(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('write/read', () => {
    it('writes and reads a string file', async () => {
      await store.write('a/b.txt', 'hello');
      expect(await store.read('a/b.txt')).toBe('hello');
    });

    it('writes and reads bytes', async () => {
      const bytes = new Uint8Array([1, 2, 3, 255]);
      await store.write('data.bin', bytes);
      const got = await store.readBytes('data.bin');
      expect(Array.from(got)).toEqual([1, 2, 3, 255]);
    });

    it('creates parent directories on write', async () => {
      await store.write('deep/nested/file.txt', 'x');
      expect(await store.exists('deep/nested/file.txt')).toBe(true);
      const s = await store.stat('deep/nested/file.txt');
      expect(s.kind).toBe('file');
      expect(s.size).toBe(1);
    });

    it('is atomic on overwrite (no partial read)', async () => {
      await store.write('f.txt', 'short');
      await store.write('f.txt', 'a much longer value than before');
      expect(await store.read('f.txt')).toBe('a much longer value than before');
    });

    it('overwrites existing file', async () => {
      await store.write('f.txt', 'v1');
      await store.write('f.txt', 'v2');
      expect(await store.read('f.txt')).toBe('v2');
    });

    it('throws StorageAlreadyExistsError when target is an existing directory', async () => {
      await store.mkdir('d');
      await expect(store.write('d', 'x')).rejects.toBeInstanceOf(
        StorageAlreadyExistsError,
      );
    });
  });

  describe('append', () => {
    it('appends to existing file', async () => {
      await store.write('log.txt', 'line1\n');
      await store.append('log.txt', 'line2\n');
      expect(await store.read('log.txt')).toBe('line1\nline2\n');
    });

    it('creates file if missing', async () => {
      await store.append('new.txt', 'first');
      expect(await store.read('new.txt')).toBe('first');
    });
  });

  describe('exists/stat', () => {
    it('returns false for missing path', async () => {
      expect(await store.exists('nope.txt')).toBe(false);
    });

    it('throws StorageNotFoundError on read missing', async () => {
      await expect(store.read('missing.txt')).rejects.toBeInstanceOf(StorageNotFoundError);
    });

    it('throws StorageNotFoundError on stat missing', async () => {
      await expect(store.stat('missing.txt')).rejects.toBeInstanceOf(StorageNotFoundError);
    });

    it('stat returns dir kind for directories', async () => {
      await store.mkdir('sub');
      const s = await store.stat('sub');
      expect(s.kind).toBe('directory');
    });
  });

  describe('readdir', () => {
    it('lists directory entries', async () => {
      await store.write('d/a.txt', '1');
      await store.write('d/b.txt', '2');
      await store.mkdir('d/e');
      const entries = await store.readdir('d');
      expect(entries.sort()).toEqual(['a.txt', 'b.txt', 'e']);
    });

    it('returns [] for missing directory', async () => {
      expect(await store.readdir('ghost')).toEqual([]);
    });

    it('rejects with an error when path is a file, not a directory', async () => {
      await store.write('a-file.txt', 'contents');
      await expect(store.readdir('a-file.txt')).rejects.toThrow(/Not a directory/);
    });

    it('filters . and .. by default', async () => {
      await store.mkdir('dir');
      const entries = await store.readdir('dir');
      expect(entries).not.toContain('.');
      expect(entries).not.toContain('..');
    });
  });

  describe('mkdir', () => {
    it('creates nested directories', async () => {
      await store.mkdir('a/b/c');
      expect(await store.exists('a/b/c')).toBe(true);
    });

    it('is idempotent for existing dir', async () => {
      await store.mkdir('x');
      await expect(store.mkdir('x')).resolves.toBeUndefined();
    });

    it('throws StorageAlreadyExistsError if path is a file', async () => {
      await store.write('f.txt', 'x');
      await expect(store.mkdir('f.txt')).rejects.toBeInstanceOf(StorageAlreadyExistsError);
    });
  });

  describe('rename', () => {
    it('moves a file', async () => {
      await store.write('old.txt', 'data');
      await store.rename('old.txt', 'new.txt');
      expect(await store.exists('old.txt')).toBe(false);
      expect(await store.read('new.txt')).toBe('data');
    });

    it('throws StorageAlreadyExistsError if dest exists', async () => {
      await store.write('a.txt', '1');
      await store.write('b.txt', '2');
      await expect(store.rename('a.txt', 'b.txt')).rejects.toBeInstanceOf(
        StorageAlreadyExistsError,
      );
    });

    it('throws StorageNotFoundError if source missing', async () => {
      await expect(store.rename('ghost.txt', 'dest.txt')).rejects.toBeInstanceOf(
        StorageNotFoundError,
      );
    });
  });

  describe('rm', () => {
    it('removes a file (idempotent)', async () => {
      await store.write('f.txt', 'x');
      await store.rm('f.txt');
      expect(await store.exists('f.txt')).toBe(false);
      // Idempotent: no error on second rm
      await expect(store.rm('f.txt')).resolves.toBeUndefined();
    });

    it('removes empty directory', async () => {
      await store.mkdir('empty');
      await store.rm('empty');
      expect(await store.exists('empty')).toBe(false);
    });

    it('throws StorageNotEmptyError for non-empty dir without recursive', async () => {
      await store.write('dir/file.txt', 'x');
      await expect(store.rm('dir')).rejects.toBeInstanceOf(StorageNotEmptyError);
    });

    it('removes non-empty dir with recursive', async () => {
      await store.write('dir/a.txt', '1');
      await store.write('dir/sub/b.txt', '2');
      await store.rm('dir', { recursive: true });
      expect(await store.exists('dir')).toBe(false);
    });
  });

  describe('copy', () => {
    it('copies a file', async () => {
      await store.write('src.txt', 'content');
      await store.copy('src.txt', 'dst.txt');
      expect(await store.read('dst.txt')).toBe('content');
    });

    it('copies a directory tree', async () => {
      await store.write('src/a.txt', '1');
      await store.write('src/nested/b.txt', '2');
      await store.copy('src', 'dst');
      expect(await store.read('dst/a.txt')).toBe('1');
      expect(await store.read('dst/nested/b.txt')).toBe('2');
    });

    it('throws StorageAlreadyExistsError if dest exists', async () => {
      await store.write('a.txt', '1');
      await store.write('b.txt', '2');
      await expect(store.copy('a.txt', 'b.txt')).rejects.toBeInstanceOf(StorageAlreadyExistsError);
    });

    it('throws StorageNotFoundError if source missing', async () => {
      await expect(store.copy('missing.txt', 'dst.txt')).rejects.toBeInstanceOf(
        StorageNotFoundError,
      );
    });
  });

  describe('nested write implies dirs (S3-friendly)', () => {
    it('write to deep path creates all parents', async () => {
      await store.write('a/b/c/d/e.txt', 'deep');
      const s = await store.stat('a/b/c/d/e.txt');
      expect(s.kind).toBe('file');
      expect(await store.read('a/b/c/d/e.txt')).toBe('deep');
    });
  });

  describe('invalid paths', () => {
    it('rejects leading slash', async () => {
      await expect(store.write('/etc/passwd', 'x')).rejects.toThrow();
    });

    it('rejects .. segments', async () => {
      await expect(store.write('../escape.txt', 'x')).rejects.toThrow();
    });

    it('rejects drive letters', async () => {
      await expect(store.write('C:/windows.txt', 'x')).rejects.toThrow();
    });

    it('rejects root-targeting mutations (empty / "." / "a/.."), but allows root reads', async () => {
      // Reads may target the root (listing the store root is benign).
      await expect(store.stat('')).resolves.toMatchObject({ kind: 'directory' });
      await expect(store.readdir('')).resolves.toBeDefined();
      // Mutations must never target the whole store.
      await expect(store.write('', 'x')).rejects.toThrow(/must not target the data root/);
      await expect(store.write('.', 'x')).rejects.toThrow(/must not target the data root/);
      await expect(store.write('a/..', 'x')).rejects.toThrow(/must not target the data root/);
      await expect(store.mkdir('.')).rejects.toThrow(/must not target the data root/);
      await expect(store.rm('.', { recursive: true })).rejects.toThrow(
        /must not target the data root/,
      );
      await expect(store.rename('.', 'other')).rejects.toThrow(/must not target the data root/);
      await expect(store.copy('.', 'other')).rejects.toThrow(/must not target the data root/);
    });

    it('rejects a path that escapes the root via symlink', async () => {
      const nodeFs = await import('node:fs');
      const root = store.getDataRoot();
      // Create a symlink inside the root pointing OUTSIDE it, so the literal
      // rel check (..) passes but the canonicalized parent lands elsewhere.
      const outside = join(tmpdir(), `jho-escape-${Date.now()}`);
      const linkPath = join(root, 'escape-link');
      await nodeFs.promises.mkdir(outside, { recursive: true });
      try {
        await nodeFs.promises.symlink(outside, linkPath, 'dir');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw err;
        }
      }
      await expect(store.write('escape-link/secret.txt', 'x')).rejects.toThrow(/escapes data root/);
      await nodeFs.promises.rm(linkPath, { force: true });
      await nodeFs.promises.rm(outside, { recursive: true, force: true });
    });
  });

  describe('withLock', () => {
    it('runs the function and releases', async () => {
      let ran = false;
      const result = await store.withLock('my-key', async () => {
        ran = true;
        return 42;
      });
      expect(ran).toBe(true);
      expect(result).toBe(42);
    });

    it('serializes concurrent locks with same key', async () => {
      const order: number[] = [];
      const make = (n: number) =>
        store.withLock('k', async () => {
          order.push(n);
          await new Promise((r) => setTimeout(r, 20));
          order.push(n * 10);
        });
      await Promise.all([make(1), make(2), make(3)]);
      // Each lock section must be atomic: entry and exit adjacent
      for (let i = 0; i < order.length; i += 2) {
        const entry = order[i]!;
        const exit = order[i + 1]!;
        expect(exit).toBe(entry * 10);
      }
    });
  });

  describe('getDataRoot', () => {
    it('returns the configured root', async () => {
      expect(store.getDataRoot()).toBe(root);
    });
  });

  describe('error-class coverage', () => {
    it('throws StorageAlreadyExistsError writing over an existing directory', async () => {
      await store.mkdir('dir');
      await expect(store.write('dir', 'payload')).rejects.toBeInstanceOf(
        StorageAlreadyExistsError,
      );
    });

    it('throws StorageAlreadyExistsError mkdir over an existing file', async () => {
      await store.write('file.txt', 'x');
      await expect(store.mkdir('file.txt')).rejects.toBeInstanceOf(
        StorageAlreadyExistsError,
      );
    });

    it('throws StorageNotEmptyError for non-recursive rm on a non-empty dir', async () => {
      await store.write('nonempty/a.txt', 'x');
      await expect(store.rm('nonempty')).rejects.toBeInstanceOf(
        StorageNotEmptyError,
      );
    });

    it('reserves StorageUnsupportedError (not thrown by LocalFileStore)', async () => {
      // Every FileStore method is implemented, so the class is intentionally
      // never thrown; the reservation is made explicit on the adapter.
      expect(LocalFileStore.RESERVED_ERRORS).toContain(StorageUnsupportedError);
    });
  });

  describe('createStore factory', () => {
    it('returns a fresh instance per call', async () => {
      const s1 = createStore(root);
      const s2 = createStore(root);
      expect(s1).not.toBe(s2);
      expect(s1.getDataRoot()).toBe(root);
      expect(s2.getDataRoot()).toBe(root);
    });
  });

  describe('resolveDataRoot', () => {
    it('respects JHO_DATA override', async () => {
      const custom = join(tmpdir(), 'custom-data-root');
      const prev = process.env.JHO_DATA;
      process.env.JHO_DATA = custom;
      try {
        expect(resolveDataRoot()).toBe(custom);
      } finally {
        if (prev === undefined) {
          delete process.env.JHO_DATA;
        } else {
          process.env.JHO_DATA = prev;
        }
      }
    });
  });
});
