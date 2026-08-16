import type { IFileSystem } from '@file-services/types';
import { createNodeFs } from '@file-services/node';
import type { FileStore, StoragePath, StorageStat, ReadDirOptions } from '../types.js';
import {
  StorageNotFoundError,
  StorageAlreadyExistsError,
  StorageNotEmptyError,
  StorageUnsupportedError,
} from '../types.js';
import { moduleLogger } from '../../core/logger/logger.js';
import { resolveDataRoot } from '../../core/paths.js';
import { toAbsolute, forbidRootTarget, canonicalizeRoot } from './path-guard.js';

const log = moduleLogger(import.meta.url);

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

const LOCK_KEY_SANITIZE = /[^a-zA-Z0-9_-]/g;
/** Rejects Windows drive letters (`C:`), which `fs.isAbsolute` does not treat as absolute on every platform. */
const LOCK_STALE_MS = 10_000;
const LOCK_RETRIES = { retries: 5, minTimeout: 50, maxTimeout: 500 };
const LOCK_DIR = '.locks';
const LOCK_EXT = '.lock';
const TEMP_EXT = '.tmp';
const RANDOM_SUFFIX_LENGTH = 6;
const KIND_FILE = 'file';
const KIND_DIR = 'directory';

/** Re-export the data-root resolver so the storage module is a self-contained entry point; the implementation stays in core/paths.ts. */
export { resolveDataRoot };

/**
 * LocalFileStore — maps the FileStore port over a vendored IFileSystem.
 * ENGINE: `@file-services/node` (createNodeFs(), pinned 11.1.1). The adapter
 * adds the root-confining path guard (src/storage/local/path-guard.ts), the
 * StoragePath → error mapping, temp+rename atomic write, recursive copy, and the
 * proper-lockfile binding. The IFileSystem is injected so the contract suite can
 * run against an in-memory adapter; default is the node-backed engine.
 * Constructor performs no I/O — getDataRoot() is pure resolution.
 *
 * Every `FileStore` method is implemented, so `StorageUnsupportedError` is
 * intentionally never thrown (it is reserved for adapters that cannot honor a
 * given operation — see its doc in types.ts).
 */
export class LocalFileStore implements FileStore {
  /**
   * Port error classes this adapter reserves but never throws (today every
   * `FileStore` method is implemented). Exposed so callers and tooling can
   * distinguish "implemented" from "reserved" without re-reading the docs.
   * See `StorageUnsupportedError` in types.ts for the rationale.
   */
  static readonly RESERVED_PORT_ERRORS = [StorageUnsupportedError] as const;

  private readonly fs: IFileSystem;
  private readonly dataRoot: string;

  constructor(dataRoot?: string, fs?: IFileSystem) {
    this.dataRoot = dataRoot ?? resolveDataRoot();
    this.fs = fs ?? createNodeFs();
  }

  getDataRoot(): string {
    return this.dataRoot;
  }

  async read(path: StoragePath): Promise<string> {
    const abs = toAbsolute(this.fs, this.dataRoot, path);
    try {
      return await this.fs.promises.readFile(abs, 'utf8');
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
      return await this.fs.promises.readFile(abs);
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
      const existing = await this.fs.promises.stat(abs);
      if (existing.isDirectory()) {
        throw new StorageAlreadyExistsError(path);
      }
    } catch (err) {
      if (err instanceof StorageAlreadyExistsError) {
        throw err;
      }
      // ENOENT/other: path is free (or another stat error) — proceed to write.
    }

    const parent = this.fs.dirname(abs);

    // Ensure parent directory exists
    try {
      await this.fs.promises.mkdir(parent, { recursive: true });
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
      await this.fs.promises.writeFile(tmp, content);
      await this.fs.promises.rename(tmp, abs);
    } catch (err) {
      // Cleanup temp on failure
      try {
        await this.fs.promises.unlink(tmp);
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
      await this.fs.promises.mkdir(parent, { recursive: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw err;
      }
    }

    // Single atomic engine call — appendFile opens with O_APPEND, so
    // concurrent appenders cannot lose updates (a composed read+write
    // would race: two appenders read the same base, then one overwrites).
    // Cast via `unknown` because `IFileSystem['promises']` lacks `appendFile`
    // in the typed surface (though every engine implements it at runtime).
    await (this.fs as unknown as FileSystemWithAppend).promises.appendFile(abs, content);
  }

  async exists(path: StoragePath): Promise<boolean> {
    const abs = toAbsolute(this.fs, this.dataRoot, path);
    try {
      await this.fs.promises.stat(abs);
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
      const stats = await this.fs.promises.stat(abs);
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
      const entries = await this.fs.promises.readdir(abs);
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
    try {
      await this.fs.promises.mkdir(abs, { recursive: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') {
        // Check if it's a file — that's an error per contract
        const stats = await this.fs.promises.stat(abs);
        if (stats.isFile()) {
          throw new StorageAlreadyExistsError(path);
        }
        // Directory already exists — idempotent success
        return;
      }
      throw err;
    }
  }

  async rename(from: StoragePath, to: StoragePath): Promise<void> {
    const src = toAbsolute(this.fs, this.dataRoot, from);
    const dest = toAbsolute(this.fs, this.dataRoot, to);
    forbidRootTarget(from, src, this.dataRoot, canonicalizeRoot(this.fs, this.dataRoot));
    forbidRootTarget(to, dest, this.dataRoot, canonicalizeRoot(this.fs, this.dataRoot));

    // Check source exists
    try {
      await this.fs.promises.stat(src);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        throw new StorageNotFoundError(from);
      }
      throw err;
    }

    // Check destination doesn't exist
    try {
      await this.fs.promises.stat(dest);
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
      await this.fs.promises.mkdir(destParent, { recursive: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw err;
      }
    }

    await this.fs.promises.rename(src, dest);
  }

  async rm(path: StoragePath, options?: { readonly recursive?: boolean }): Promise<void> {
    const abs = toAbsolute(this.fs, this.dataRoot, path);
    forbidRootTarget(path, abs, this.dataRoot, canonicalizeRoot(this.fs, this.dataRoot));
    try {
      const stats = await this.fs.promises.stat(abs);
      if (stats.isDirectory()) {
        if (!options?.recursive) {
          // Check if empty
          const entries = await this.fs.promises.readdir(abs);
          if (entries.length > 0) {
            throw new StorageNotEmptyError(path);
          }
        }
        // rmdir handles the (empty) directory; rm with recursive handles trees
        if (options?.recursive) {
          await this.fs.promises.rm(abs, { recursive: true });
        } else {
          await this.fs.promises.rmdir(abs);
        }
      } else {
        await this.fs.promises.unlink(abs);
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
      await this.fs.promises.stat(src);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        throw new StorageNotFoundError(from);
      }
      throw err;
    }

    // Check destination doesn't exist
    try {
      await this.fs.promises.stat(dest);
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
      await this.fs.promises.mkdir(destParent, { recursive: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw err;
      }
    }

    await this.copyRecursive(src, dest);
  }

  private async copyRecursive(src: string, dest: string): Promise<void> {
    const stats = await this.fs.promises.stat(src);
    if (stats.isDirectory()) {
      await this.fs.promises.mkdir(dest, { recursive: true });
      const entries = await this.fs.promises.readdir(src);
      for (const entry of entries) {
        await this.copyRecursive(this.fs.join(src, entry), this.fs.join(dest, entry));
      }
    } else {
      const data = await this.fs.promises.readFile(src);
      await this.fs.promises.writeFile(dest, data);
    }
  }

  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // Use proper-lockfile for advisory locking (same as src/core/locks.ts).
    // Lock on a sidecar file under the data root's LOCK_DIR/ directory.
    const lockDir = this.fs.join(this.dataRoot, LOCK_DIR);
    await this.fs.promises.mkdir(lockDir, { recursive: true });
    // Canonicalize the lock directory (which exists) so processes reaching
    // the same data root through different path spellings (symlinked homes,
    // macOS /tmp → /private/tmp) contend on the same lockfile, matching
    // core/locks.ts. `realpath: false` stays: the base file itself never
    // exists on disk (proper-lockfile would fail to resolve it).
    const canonicalLockDir = await this.fs.promises.realpath(lockDir);
    const lockFile = this.fs.join(
      canonicalLockDir,
      `${key.replace(LOCK_KEY_SANITIZE, '_')}${LOCK_EXT}`,
    );
    // Dynamic import to avoid a hard dependency on proper-lockfile in the
    // type layer (only used here; consumers of the port don't pay the cost).
    const lockfile = await import('proper-lockfile');
    const release = await lockfile.default.lock(lockFile, {
      retries: LOCK_RETRIES,
      stale: LOCK_STALE_MS,
      realpath: false,
    });
    try {
      return await fn();
    } finally {
      try {
        await release();
      } catch {
        log.warn({ key }, 'lock.release.failed');
      }
    }
  }
}
