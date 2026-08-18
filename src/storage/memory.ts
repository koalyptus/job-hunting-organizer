import { posix as posixPath } from 'node:path';
import { createFsFromVolume, Volume } from 'memfs';
import type { IFileSystem } from '@file-services/types';
import type { FileStore, StoragePath, StorageStat, ReadDirOptions } from './types.js';
import { StorageNotFoundError, StorageAlreadyExistsError, StorageNotEmptyError } from './types.js';
import { moduleLogger } from '../core/logger/logger.js';
import { toAbsolute, forbidRootTarget, canonicalizeRoot } from './local/path-guard.js';

const MEMORY_ROOT = '/';
const MEMORY_DATA_ROOT = 'memory://jho';
const TEMP_EXT = '.tmp';
const RANDOM_SUFFIX_LENGTH = 6;
const KIND_FILE = 'file';
const KIND_DIR = 'directory';

/** Exported for test spying on internal logging. */
export const log = moduleLogger(import.meta.url);

/**
 * Build an `IFileSystem`-compatible surface over memfs. memfs's `IFs` exposes
 * only `promises` + `realpathSync` (no path module), so the path API required
 * by `path-guard` (`isAbsolute`/`resolve`/`relative`/`dirname`) is bridged from
 * node's posix `path`. The synthetic volume root is `/`; `getDataRoot()`
 * returns the stable `memory://jho` label instead (see MemoryFileStore).
 *
 * The volume starts with an empty `/`, ensure root directory exists so
 * path-guard's canonicalizeRoot (realpathSync) resolves rather than
 * falling back to root. memfs's Volume() already creates the root
 * directory implicitly, so this mkdirSync is a safe no-op on a fresh
 * volume and succeeds (no throw) on a pre-existing root.
 */
function createMemoryFileSystem(): IFileSystem {
  const vol = new Volume();
  const volumeFs = createFsFromVolume(vol);
  volumeFs.mkdirSync(MEMORY_ROOT, { recursive: true });
  return {
    ...posixPath,
    sep: posixPath.sep,
    delimiter: posixPath.delimiter,
    realpathSync: volumeFs.realpathSync.bind(volumeFs),
    promises: volumeFs.promises,
  } as unknown as IFileSystem;
}

/**
 * MemoryFileStore — maps the FileStore port over an in-memory memfs volume.
 * ENGINE: `memfs` v4 (createFsFromVolume/Volume). Mirrors LocalFileStore's
 * boundary behavior and error mapping exactly, but keeps nothing on disk, so
 * tests can run without a temp directory.
 */
export class MemoryFileStore implements FileStore {
  private readonly fs: IFileSystem;
  private readonly fsp: FileSystemWithAppend['promises'];
  private readonly dataRoot: string;
  private readonly locks = new Map<string, Promise<void>>();

  constructor() {
    this.fs = createMemoryFileSystem();
    this.fsp = (this.fs as unknown as FileSystemWithAppend).promises;
    this.dataRoot = MEMORY_ROOT;
  }

  getDataRoot(): string {
    return MEMORY_DATA_ROOT;
  }

  async read(path: StoragePath): Promise<string> {
    const abs = toAbsolute(this.fs, this.dataRoot, path);
    try {
      return await this.fsp.readFile(abs, 'utf8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        throw new StorageNotFoundError(path);
      }
      throw err;
    }
  }

  async readBytes(path: StoragePath): Promise<Uint8Array> {
    const abs = toAbsolute(this.fs, this.dataRoot, path);
    try {
      return await this.fsp.readFile(abs);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        throw new StorageNotFoundError(path);
      }
      throw err;
    }
  }

  async write(path: StoragePath, content: string | Uint8Array): Promise<void> {
    const abs = toAbsolute(this.fs, this.dataRoot, path);
    forbidRootTarget(path, abs, this.dataRoot, canonicalizeRoot(this.fs, this.dataRoot));
    // Existing directory at the target path is not a valid write target:
    // the temp+rename below would fail with EISDIR, but surfacing the
    // port's StorageAlreadyExistsError is the explicit contract for "write
    // over an existing entry". (Writing over an existing FILE is a supported
    // atomic overwrite, covered by other tests, so only directories reject.)
    try {
      const existing = await this.fsp.stat(abs);
      if (existing.isDirectory()) {
        throw new StorageAlreadyExistsError(path);
      }
    } catch (err) {
      if (err instanceof StorageAlreadyExistsError) {
        throw err;
      }
      // ENOENT/other: path is free, or stat itself failed — proceed to write;
      // the engine will surface a clear error if the final target is invalid.
    }

    const parent = this.fs.dirname(abs);

    // Ensure parent directory exists
    try {
      await this.fsp.mkdir(parent, { recursive: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw err;
      }
    }

    // Temp + rename for atomicity
    const timestamp = Date.now();
    const random = Math.random()
      .toString(36)
      .slice(2, 2 + RANDOM_SUFFIX_LENGTH);
    const tmp = `${abs}.${process.pid}.${timestamp}.${random}${TEMP_EXT}`;
    try {
      await this.fsp.writeFile(tmp, content);
      await this.fsp.rename(tmp, abs);
    } catch (err) {
      // Cleanup temp on failure
      try {
        await this.fsp.unlink(tmp);
      } catch {
        // Ignore cleanup errors
      }
      throw err;
    }
  }

  async append(path: StoragePath, content: string | Uint8Array): Promise<void> {
    const abs = toAbsolute(this.fs, this.dataRoot, path);
    forbidRootTarget(path, abs, this.dataRoot, canonicalizeRoot(this.fs, this.dataRoot));
    const parent = this.fs.dirname(abs);
    try {
      await this.fsp.mkdir(parent, { recursive: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw err;
      }
    }

    // Single atomic engine call — appendFile opens with O_APPEND, so
    // concurrent appenders cannot lose updates.
    await this.fsp.appendFile(abs, content);
  }

  async exists(path: StoragePath): Promise<boolean> {
    const abs = toAbsolute(this.fs, this.dataRoot, path);
    try {
      await this.fsp.stat(abs);
      return true;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        return false;
      }
      throw err;
    }
  }

  async stat(path: StoragePath): Promise<StorageStat> {
    const abs = toAbsolute(this.fs, this.dataRoot, path);
    try {
      const stats = await this.fsp.stat(abs);
      return {
        kind: stats.isDirectory() ? KIND_DIR : KIND_FILE,
        size: stats.size,
        mtime: stats.mtime,
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        throw new StorageNotFoundError(path);
      }
      throw err;
    }
  }

  async readdir(path: StoragePath, options?: ReadDirOptions): Promise<StoragePath[]> {
    const abs = toAbsolute(this.fs, this.dataRoot, path);
    try {
      const entries = await this.fsp.readdir(abs);
      if (!options?.includeSpecialEntries) {
        return entries.filter((e) => e !== '.' && e !== '..');
      }
      return entries;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return []; // missing dir → empty array, per contract
      }
      if (code === 'ENOTDIR') {
        throw new Error(`Not a directory: ${path}`);
      }
      throw err;
    }
  }

  async mkdir(path: StoragePath): Promise<void> {
    const abs = toAbsolute(this.fs, this.dataRoot, path);
    forbidRootTarget(path, abs, this.dataRoot, canonicalizeRoot(this.fs, this.dataRoot));
    // memfs treats mkdir over an existing file as a success (node throws
    // EEXIST), so stat to discriminate file-vs-directory and honor the port
    // contract: an existing file rejects, an existing directory is idempotent.
    await this.fsp.mkdir(abs, { recursive: true });
    const stats = await this.fsp.stat(abs);
    if (stats.isFile()) {
      throw new StorageAlreadyExistsError(path);
    }
  }

  async rename(from: StoragePath, to: StoragePath): Promise<void> {
    const src = toAbsolute(this.fs, this.dataRoot, from);
    const dest = toAbsolute(this.fs, this.dataRoot, to);
    forbidRootTarget(from, src, this.dataRoot, canonicalizeRoot(this.fs, this.dataRoot));
    forbidRootTarget(to, dest, this.dataRoot, canonicalizeRoot(this.fs, this.dataRoot));

    // Check source exists
    try {
      await this.fsp.stat(src);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        throw new StorageNotFoundError(from);
      }
      throw err;
    }

    // Check destination doesn't exist
    try {
      await this.fsp.stat(dest);
      throw new StorageAlreadyExistsError(to);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        throw err;
      }
    }

    // Ensure dest parent exists
    const destParent = this.fs.dirname(dest);
    try {
      await this.fsp.mkdir(destParent, { recursive: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw err;
      }
    }

    await this.fsp.rename(src, dest);
  }

  async rm(path: StoragePath, options?: { readonly recursive?: boolean }): Promise<void> {
    const abs = toAbsolute(this.fs, this.dataRoot, path);
    forbidRootTarget(path, abs, this.dataRoot, canonicalizeRoot(this.fs, this.dataRoot));
    try {
      const stats = await this.fsp.stat(abs);
      if (stats.isDirectory()) {
        if (!options?.recursive) {
          // Check if empty
          const entries = await this.fsp.readdir(abs);
          if (entries.length > 0) {
            throw new StorageNotEmptyError(path);
          }
        }
        // rmdir handles the (empty) directory; rm with recursive handles trees
        if (options?.recursive) {
          await this.fsp.rm(abs, { recursive: true });
        } else {
          await this.fsp.rmdir(abs);
        }
      } else {
        await this.fsp.unlink(abs);
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        // Idempotent: a missing path (file or dir) is a successful removal
        return;
      }
      throw err;
    }
  }

  async copy(from: StoragePath, to: StoragePath): Promise<void> {
    const src = toAbsolute(this.fs, this.dataRoot, from);
    const dest = toAbsolute(this.fs, this.dataRoot, to);
    forbidRootTarget(from, src, this.dataRoot, canonicalizeRoot(this.fs, this.dataRoot));
    forbidRootTarget(to, dest, this.dataRoot, canonicalizeRoot(this.fs, this.dataRoot));

    // Source must exist — normalize to the port's not-found error (same as rename).
    try {
      await this.fsp.stat(src);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        throw new StorageNotFoundError(from);
      }
      throw err;
    }

    // Check destination doesn't exist
    try {
      await this.fsp.stat(dest);
      throw new StorageAlreadyExistsError(to);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        throw err;
      }
    }

    // Ensure dest parent exists
    const destParent = this.fs.dirname(dest);
    try {
      await this.fsp.mkdir(destParent, { recursive: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw err;
      }
    }

    await this.copyRecursive(src, dest);
  }

  private async copyRecursive(src: string, dest: string): Promise<void> {
    const stats = await this.fsp.stat(src);
    if (stats.isDirectory()) {
      await this.fsp.mkdir(dest, { recursive: true });
      const entries = await this.fsp.readdir(src);
      for (const entry of entries) {
        await this.copyRecursive(this.fs.join(src, entry), this.fs.join(dest, entry));
      }
    } else {
      const data = await this.fsp.readFile(src);
      await this.fsp.writeFile(dest, data);
    }
  }

  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // In-process async mutex keyed by lock key — proper-lockfile needs real
    // disk, so we serialize same-key holders through a promise chain. No disk,
    // no cross-process guarantees, which is exactly what in-memory tests need.
    const prev = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const owned = prev.then(() => fn().finally(() => release()));
    this.locks.set(key, next);
    // Drop settled chains so the map stays bounded; the caller still awaits
    // `owned` and receives fn's value or rejection.
    owned
      .finally(() => {
        if (this.locks.get(key) === next) {
          this.locks.delete(key);
        }
      })
      .catch(() => {
        log.warn({ key }, 'withLock.unexpected.rejection');
      });
    return owned;
  }
}

/**
 * The typed async surface omits `appendFile` even though every vendored
 * engine (node-fs, memfs) exposes it at runtime. Reach it through this
 * minimal typed extension so `append` is a single atomic engine call
 * instead of a composed read+write (which has a TOCTOU lost-update window
 * when two appenders race).
 */
interface FileSystemWithAppend {
  promises: IFileSystem['promises'] & {
    appendFile(path: string, data: string | Uint8Array): Promise<void>;
  };
}
