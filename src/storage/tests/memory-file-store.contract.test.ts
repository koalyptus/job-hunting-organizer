import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { log as memoryLog, MemoryFileStore } from '../memory.js';
import { createStore } from '../local/factory.js';
import { LocalFileStore } from '../local/local-file-store.js';
import { StorageNotFoundError, StorageAlreadyExistsError, StorageNotEmptyError } from '../types.js';
import type { IFileSystem, IFileSystemStats } from '@file-services/types';
import { createFsFromVolume, Volume } from 'memfs';
import { posix as posixPath } from 'node:path';

describe('MemoryFileStore contract suite', () => {
  let store: MemoryFileStore;

  beforeEach(async () => {
    store = new MemoryFileStore();
  });

  afterEach(() => {
    // Restore any spies (e.g. the withLock warn spy) to prevent leakage.
    vi.restoreAllMocks();
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
      await expect(store.write('d', 'x')).rejects.toBeInstanceOf(StorageAlreadyExistsError);
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
    it('returns the stable in-memory label', async () => {
      expect(store.getDataRoot()).toBe('memory://jho');
    });
  });

  describe('error-class coverage', () => {
    it('throws StorageNotFoundError for missing path read', async () => {
      await expect(store.read('nope.txt')).rejects.toBeInstanceOf(StorageNotFoundError);
    });
  });

  describe('createStore factory (in-memory option)', () => {
    it('returns a MemoryFileStore for { inMemory: true }', async () => {
      const s = createStore({ inMemory: true });
      expect(s).toBeInstanceOf(MemoryFileStore);
      expect(s.getDataRoot()).toBe('memory://jho');
    });

    it('returns a LocalFileStore for a data-root string (no breakage)', async () => {
      const s = createStore('/tmp/jho-data');
      expect(s).toBeInstanceOf(LocalFileStore);
      expect(s.getDataRoot()).toBe('/tmp/jho-data');
    });

    it('returns a fresh instance per call', async () => {
      const s1 = createStore({ inMemory: true });
      const s2 = createStore({ inMemory: true });
      expect(s1).not.toBe(s2);
    });

    it('returns a LocalFileStore for { dataRoot: ... }', async () => {
      const s = createStore({ dataRoot: '/custom/root' });
      expect(s).toBeInstanceOf(LocalFileStore);
      expect(s.getDataRoot()).toBe('/custom/root');
    });
  });

  describe('readdir includeSpecialEntries', () => {
    it('passes includeSpecialEntries option to engine (branch exercised)', async () => {
      await store.mkdir('special');
      await store.write('special/file.txt', 'x');
      // memfs doesn't include . and .. even with includeSpecialEntries,
      // but the code path bypasses the filter when true
      const entries = await store.readdir('special', { includeSpecialEntries: true });
      expect(entries).toContain('file.txt');
      // Default (false) still filters
      const filtered = await store.readdir('special');
      expect(filtered).toEqual(['file.txt']);
    });
  });

  describe('withLock error handling', () => {
    it('logs unexpected rejection when fn throws', async () => {
      const warnSpy = vi.spyOn(memoryLog, 'warn').mockImplementation(() => {});
      await expect(
        store.withLock('throw-key', async () => {
          throw new Error('deliberate failure');
        }),
      ).rejects.toThrow('deliberate failure');
      expect(warnSpy).toHaveBeenCalledWith({ key: 'throw-key' }, 'withLock.unexpected.rejection');
    });
  });

  describe('error propagation — non-ENOENT/ENOTDIR rethrow', () => {
    function makeFailingStore(override: Partial<IFileSystem['promises']>) {
      const vol = new Volume();
      const volumeFs = createFsFromVolume(vol);
      try {
        volumeFs.mkdirSync('/', { recursive: true });
      } catch {
        // Root already present.
      }
      const base = {
        ...posixPath,
        sep: posixPath.sep,
        delimiter: posixPath.delimiter,
        realpathSync: volumeFs.realpathSync.bind(volumeFs),
        promises: volumeFs.promises,
      } as unknown as IFileSystem;
      const failingFs = {
        ...base,
        promises: {
          ...(base.promises as unknown as Record<string, unknown>),
          ...(override as Record<string, unknown>),
        },
      } as unknown as IFileSystem;
      const store = new MemoryFileStore();
      // @ts-expect-error - monkey-patch private fs for testing
      store.fs = failingFs;
      // @ts-expect-error - monkey-patch private fsp
      store.fsp = failingFs.promises;
      return store;
    }

    it('read rethrows non-ENOENT/ENOTDIR (e.g., EACCES)', async () => {
      const failing = makeFailingStore({
        readFile: async () => {
          throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
        },
      });
      await expect(failing.read('x.txt')).rejects.toMatchObject({ code: 'EACCES' });
    });

    it('readBytes rethrows non-ENOENT/ENOTDIR', async () => {
      const failing = makeFailingStore({
        readFile: async () => {
          throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
        },
      });
      await expect(failing.readBytes('x.bin')).rejects.toMatchObject({ code: 'EACCES' });
    });

    it('write parent mkdir rethrows non-EEXIST (ENOTDIR)', async () => {
      // mkdir parent fails with ENOTDIR when intermediate is a file
      const failing = makeFailingStore({
        mkdir: async () => {
          throw Object.assign(new Error('ENOTDIR'), { code: 'ENOTDIR' });
        },
      });
      await expect(failing.write('a/b.txt', 'x')).rejects.toMatchObject({ code: 'ENOTDIR' });
    });

    it('write cleanup rethrows on rename failure after temp written', async () => {
      // write succeeds, rename fails → cleanup runs
      let writeCalled = false;
      const failing = makeFailingStore({
        writeFile: async () => {
          writeCalled = true;
        },
        rename: async () => {
          throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
        },
        unlink: async () => {}, // cleanup succeeds
      });
      await expect(failing.write('x.txt', 'x')).rejects.toMatchObject({ code: 'EACCES' });
      expect(writeCalled).toBe(true);
    });

    it('append parent mkdir rethrows non-EEXIST', async () => {
      const failing = makeFailingStore({
        mkdir: async () => {
          throw Object.assign(new Error('ENOTDIR'), { code: 'ENOTDIR' });
        },
      });
      await expect(failing.append('a/b.txt', 'x')).rejects.toMatchObject({ code: 'ENOTDIR' });
    });

    it('exists rethrows non-ENOENT/ENOTDIR', async () => {
      const failing = makeFailingStore({
        stat: async () => {
          throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
        },
      });
      await expect(failing.exists('x.txt')).rejects.toMatchObject({ code: 'EACCES' });
    });

    it('stat rethrows non-ENOENT/ENOTDIR', async () => {
      const failing = makeFailingStore({
        stat: async () => {
          throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
        },
      });
      await expect(failing.stat('x.txt')).rejects.toMatchObject({ code: 'EACCES' });
    });

    it('readdir ENOTDIR throws "Not a directory" (not rethrow)', async () => {
      const failing = makeFailingStore({
        readdir: async () => {
          throw Object.assign(new Error('ENOTDIR'), { code: 'ENOTDIR' });
        },
      });
      await expect(failing.readdir('x.txt')).rejects.toThrow(/Not a directory/);
    });

    it('readdir rethrows other errors', async () => {
      const failing = makeFailingStore({
        readdir: async () => {
          throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
        },
      });
      await expect(failing.readdir('dir')).rejects.toMatchObject({ code: 'EACCES' });
    });

    it('rename source stat rethrows non-ENOENT/ENOTDIR', async () => {
      const failing = makeFailingStore({
        stat: async () => {
          throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
        },
      });
      await expect(failing.rename('src.txt', 'dst.txt')).rejects.toMatchObject({ code: 'EACCES' });
    });

    it('rename dest parent mkdir rethrows non-EEXIST', async () => {
      const sourceStat = {
        isFile: () => true,
        isDirectory: () => false,
        size: 1,
        mtime: new Date(),
      } as unknown as IFileSystemStats;
      const failing = makeFailingStore({
        stat: async (path: string) => {
          // source exists
          if (path.endsWith('src.txt')) {
            return sourceStat;
          }
          // dest doesn't exist
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        },
        mkdir: async () => {
          throw Object.assign(new Error('ENOTDIR'), { code: 'ENOTDIR' });
        },
      });
      await expect(failing.rename('src.txt', 'a/b.txt')).rejects.toMatchObject({ code: 'ENOTDIR' });
    });

    it('copy source stat rethrows non-ENOENT/ENOTDIR', async () => {
      const failing = makeFailingStore({
        stat: async () => {
          throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
        },
      });
      await expect(failing.copy('src.txt', 'dst.txt')).rejects.toMatchObject({ code: 'EACCES' });
    });

    it('copy dest parent mkdir rethrows non-EEXIST', async () => {
      const sourceStat = {
        isFile: () => true,
        isDirectory: () => false,
        size: 1,
        mtime: new Date(),
      } as unknown as IFileSystemStats;
      const failing = makeFailingStore({
        stat: async (path: string) => {
          // source exists
          if (path.endsWith('src.txt')) {
            return sourceStat;
          }
          // dest doesn't exist
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        },
        mkdir: async () => {
          throw Object.assign(new Error('ENOTDIR'), { code: 'ENOTDIR' });
        },
      });
      await expect(failing.copy('src.txt', 'a/b.txt')).rejects.toMatchObject({ code: 'ENOTDIR' });
    });

    it('readBytes throws StorageNotFoundError on ENOTDIR', async () => {
      const failing = makeFailingStore({
        readFile: async () => {
          throw Object.assign(new Error('ENOTDIR'), { code: 'ENOTDIR' });
        },
      });
      await expect(failing.readBytes('x.bin')).rejects.toBeInstanceOf(StorageNotFoundError);
    });

    it('write swallows cleanup unlink errors and rethrows the original', async () => {
      const failing = makeFailingStore({
        writeFile: async () => {},
        rename: async () => {
          throw Object.assign(new Error('EISDIR'), { code: 'EISDIR' });
        },
        unlink: async () => {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        },
      });
      await expect(failing.write('x.txt', 'x')).rejects.toMatchObject({ code: 'EISDIR' });
    });
  });
});
