import { mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNodeFs } from '@file-services/node';
import type { IFileSystem } from '@file-services/types';
import { LocalFileStore } from '../local/file-store.js';
import { StorageNotFoundError } from '../types.js';

/**
 * LocalFileStore implementation-detail suite — the error branches the
 * contract suite does not drive (raw rethrows, temp cleanup, lock-release
 * failure, injected-fs seams).
 */
describe('LocalFileStore unit suite', () => {
  let root: string;
  let store: LocalFileStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'jho-file-store-test-'));
    store = new LocalFileStore(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('path handling', () => {
    it('defaults to the resolved data root and the node fs', () => {
      const bare = new LocalFileStore();
      expect(bare.getDataRoot()).toBe(resolve(process.env['JHO_DATA'] as string));
    });

    it('resolves an empty path to the data root', async () => {
      const stat = await store.stat('');
      expect(stat.kind).toBe('directory');
    });

    it('rejects paths that escape the data root', async () => {
      await expect(store.read('a/../../b')).rejects.toThrow('Path escapes data root');
    });
  });

  describe('read / readBytes', () => {
    it('maps ENOTDIR to StorageNotFoundError on read', async () => {
      await store.write('f.txt', 'x');
      await expect(store.read('f.txt/child')).rejects.toBeInstanceOf(StorageNotFoundError);
    });

    it('rethrows non-ENOENT/ENOTDIR errors on read', async () => {
      await expect(store.read('')).rejects.toMatchObject({ code: 'EISDIR' });
    });

    it('maps ENOENT to StorageNotFoundError on readBytes', async () => {
      await expect(store.readBytes('missing.bin')).rejects.toBeInstanceOf(StorageNotFoundError);
    });

    it('rethrows non-ENOENT/ENOTDIR errors on readBytes', async () => {
      await expect(store.readBytes('')).rejects.toMatchObject({ code: 'EISDIR' });
    });
  });

  describe('write', () => {
    it('rethrows mkdir failures other than EEXIST', async () => {
      await store.write('f.txt', 'x');
      await expect(store.write('f.txt/sub/child.txt', 'x')).rejects.toMatchObject({
        code: 'ENOTDIR',
      });
    });

    it('cleans up the temp file when the rename fails', async () => {
      await store.mkdir('d');
      // POSIX reports EISDIR for rename-onto-directory; Windows reports EPERM.
      await expect(store.write('d', 'x')).rejects.toMatchObject({
        code: expect.stringMatching(/^(EISDIR|EPERM)$/),
      });
      expect((await readdir(root)).filter((e) => e.endsWith('.tmp'))).toEqual([]);
    });

    it('swallows temp-cleanup errors when the rename fails', async () => {
      const base = createNodeFs();
      const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
      const failing: IFileSystem = {
        ...base,
        promises: {
          ...base.promises,
          rename: async () => {
            throw err;
          },
          unlink: async () => {
            throw err;
          },
        },
      };
      const failingStore = new LocalFileStore(root, failing);
      await expect(failingStore.write('a.txt', 'x')).rejects.toBe(err);
    });
  });

  describe('append', () => {
    it('rethrows mkdir failures other than EEXIST', async () => {
      await store.write('f.txt', 'x');
      await expect(store.append('f.txt/sub/child.txt', 'x')).rejects.toMatchObject({
        code: 'ENOTDIR',
      });
    });

    it('rethrows non-ENOENT/ENOTDIR read errors', async () => {
      await store.mkdir('d');
      await expect(store.append('d', 'x')).rejects.toMatchObject({ code: 'EISDIR' });
    });

    it('appends byte arrays', async () => {
      await store.write('b.bin', new Uint8Array([1, 2]));
      await store.append('b.bin', new Uint8Array([3]));
      expect(Array.from(await store.readBytes('b.bin'))).toEqual([1, 2, 3]);
    });
  });

  describe('exists / stat', () => {
    it('returns false for ENOTDIR paths on exists', async () => {
      await store.write('f.txt', 'x');
      expect(await store.exists('f.txt/child')).toBe(false);
    });

    it('rethrows non-ENOENT/ENOTDIR errors on exists', async () => {
      await store.write('a', 'x');
      await symlink('b', join(root, 'a.lnk'));
      await symlink('a.lnk', join(root, 'b'));
      await expect(store.exists('a.lnk')).rejects.toMatchObject({ code: 'ELOOP' });
    });

    it('maps ENOTDIR to StorageNotFoundError on stat', async () => {
      await store.write('f.txt', 'x');
      await expect(store.stat('f.txt/child')).rejects.toBeInstanceOf(StorageNotFoundError);
    });

    it('rethrows non-ENOENT/ENOTDIR errors on stat', async () => {
      await store.write('a', 'x');
      await symlink('b', join(root, 'a.lnk'));
      await symlink('a.lnk', join(root, 'b'));
      await expect(store.stat('a.lnk')).rejects.toMatchObject({ code: 'ELOOP' });
    });
  });

  describe('readdir', () => {
    it('returns raw entries when includeSpecialEntries is set', async () => {
      await store.write('x.txt', 'x');
      const entries = await store.readdir('', { includeSpecialEntries: true });
      expect(entries).toContain('x.txt');
    });

    it('rethrows non-ENOENT/ENOTDIR errors', async () => {
      await store.write('a', 'x');
      await symlink('b', join(root, 'a.lnk'));
      await symlink('a.lnk', join(root, 'b'));
      await expect(store.readdir('a.lnk')).rejects.toMatchObject({ code: 'ELOOP' });
    });
  });

  describe('mkdir', () => {
    it('rethrows mkdir failures other than EEXIST', async () => {
      await store.write('f.txt', 'x');
      await expect(store.mkdir('f.txt/child')).rejects.toMatchObject({ code: 'ENOTDIR' });
    });

    it('treats EEXIST on an existing directory as idempotent success', async () => {
      await store.mkdir('sub');
      const base = createNodeFs();
      const err = Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
      const failing: IFileSystem = {
        ...base,
        promises: {
          ...base.promises,
          mkdir: async () => {
            throw err;
          },
        },
      };
      const failingStore = new LocalFileStore(root, failing);
      await expect(failingStore.mkdir('sub')).resolves.toBeUndefined();
    });
  });

  describe('rename', () => {
    it('maps missing source to StorageNotFoundError', async () => {
      await expect(store.rename('missing.txt', 'target.txt')).rejects.toBeInstanceOf(
        StorageNotFoundError,
      );
    });

    it('rethrows non-ENOENT/ENOTDIR source-stat errors', async () => {
      await store.write('a', 'x');
      await symlink('b', join(root, 'a.lnk'));
      await symlink('a.lnk', join(root, 'b'));
      await expect(store.rename('a.lnk', 'target.txt')).rejects.toMatchObject({ code: 'ELOOP' });
    });

    it('rethrows dest-parent mkdir failures other than EEXIST', async () => {
      await store.write('a.txt', 'x');
      await store.write('f.txt', 'x');
      await expect(store.rename('a.txt', 'f.txt/sub/child.txt')).rejects.toMatchObject({
        code: 'ENOTDIR',
      });
    });
  });

  describe('copy', () => {
    it('rethrows dest-parent mkdir failures other than EEXIST', async () => {
      await store.write('a.txt', 'x');
      await store.write('f.txt', 'x');
      await expect(store.copy('a.txt', 'f.txt/sub/copied.txt')).rejects.toMatchObject({
        code: 'ENOTDIR',
      });
    });
  });

  describe('withLock', () => {
    it('logs a warning and still resolves when releasing fails', async () => {
      const result = await store.withLock('task1', async () => {
        await writeFile(join(root, '.locks', 'task1.lock.lock', 'blocker'), 'x');
        return 'done';
      });
      expect(result).toBe('done');
    });
  });
});
