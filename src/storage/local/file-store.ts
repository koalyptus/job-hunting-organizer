import type { IFileSystem } from '@file-services/types';
import { createNodeFs } from '@file-services/node';
import type { FileStore, StoragePath, StorageStat, ReadDirOptions } from '../types.js';
import { StorageNotFoundError, StorageAlreadyExistsError, StorageNotEmptyError } from '../types.js';
import { moduleLogger } from '../../core/logger/logger.js';
import { resolveDataRoot } from '../../core/paths.js';

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
/** A StoragePath must be relative — reject Windows drive letters (`C:`). `fs.isAbsolute` already catches these on Windows; this also guards POSIX. */
const STORAGEPATH_NO_DRIVE = /^[a-zA-Z]:/;
const LOCK_STALE_MS = 10_000;
const LOCK_RETRIES = { retries: 5, minTimeout: 50, maxTimeout: 500 };
const LOCK_DIR = '.locks';
const LOCK_EXT = '.lock';
const TEMP_EXT = '.tmp';
const RANDOM_SUFFIX_LENGTH = 6;
const KIND_FILE = 'file';
const KIND_DIR = 'directory';

/**
 * Re-export the canonical data-root resolver so the storage module is a
 * self-contained entry point. The real implementation lives in
 * `core/paths.ts` (single source of truth for `~/.job-hunting-organizer-data`
 * and the `$JHO_DATA` override); we do not re-implement it here.
 */
export { resolveDataRoot };

/**
 * Normalize a StoragePath to an absolute host path under the data root.
 *
 * Security contract (defense in depth — the engine is unrooted and does NOT
 * confine, so every escape must be caught here):
 *  1. Reject absolute paths, ".." segments, and Windows drive letters
 *     (e.g. "C:") — both host-native (fs.isAbsolute) and explicit.
 *  2. Reject anything that escapes the root after resolution, including via
 *     symlinks: the literal relative form must not start with "..", AND the
 *     deepest existing ancestor is canonicalized (realpath) and re-checked,
 *     because a symlink inside the root can point outside it. (realpath on a
 *     not-yet-existing write target throws ENOENT, so we walk up to the
 *     nearest existing ancestor; an ELOOP from a symlink cycle is left to
 *     surface as-is.)
 *
 * An empty / "." path resolves to the ROOT itself (so reads can list the
 * store root); mutating operations separately forbid targeting the root via
 * `forbidRootTarget`. Path arithmetic uses the engine's own path API (no
 * `node:path` imports under `src/storage/`).
 */
function toAbsolute(fs: IFileSystem, root: string, path: StoragePath): string {
  if (fs.isAbsolute(path) || path.startsWith('..') || STORAGEPATH_NO_DRIVE.test(path)) {
    throw new Error(
      `Invalid StoragePath: "${path}" — must be relative (host-native), no absolute paths, no '..', no drive letters`,
    );
  }
  const abs = fs.resolve(root, path);
  const canonicalRoot = canonicalizeRoot(fs, root);
  // Literal ".." check uses the declared root (both symlink-spelled); the
  // symlink-aware walk below uses the canonical root.
  assertWithinRoot(fs, root, canonicalRoot, abs, path);
  return abs;
}

/**
 * Canonicalize the data root once. macOS keeps /var/folders (and /tmp) as a
 * symlink to /private/var/folders, so the root passed in may not be the
 * on-disk canonical path. Comparing canonical-vs-canonical in assertWithinRoot
 * avoids every normal path tripping the escape check on such platforms.
 */
function canonicalizeRoot(fs: IFileSystem, root: string): string {
  try {
    return fs.realpathSync(root);
  } catch {
    return root;
  }
}

/**
 * Confirm `abs` stays under `root`, defeating both literal ".." escapes and
 * symlink escapes. The literal check compares against the declared `root`
 * (so a symlinked root like /tmp → /private/tmp is fine); the realpath walk
 * compares against `canonicalRoot` so a symlink *inside* the root pointing
 * *outside* it is detected. The walk canonicalizes the deepest existing
 * ancestor (the write target itself may not exist yet).
 */
function assertWithinRoot(
  fs: IFileSystem,
  root: string,
  canonicalRoot: string,
  abs: string,
  path: StoragePath,
): void {
  const rel = fs.relative(root, abs);
  if (rel.startsWith('..') || fs.isAbsolute(rel)) {
    throw new Error(`Path escapes data root: "${path}"`);
  }
  // Walk up to the nearest existing ancestor and canonicalize it.
  let dir = abs;
  for (;;) {
    try {
      const real = fs.realpathSync(dir);
      const realRel = fs.relative(canonicalRoot, real);
      if (realRel.startsWith('..') || fs.isAbsolute(realRel)) {
        throw new Error(`Path escapes data root via symlink: "${path}"`);
      }
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        // ENOENT: component missing. ENOTDIR: a path component is a file, not a
        // directory (e.g. "f.txt/child") — still walk up to the nearest real
        // directory ancestor and check confinement there.
        const parent = fs.dirname(dir);
        if (parent === dir || parent === root) {
          // Reached the root (or above) without finding an existing entry —
          // the resolved path is under root by construction.
          return;
        }
        dir = parent;
        continue;
      }
      // ELOOP (symlink cycle) or any other error: surface as-is (callers map
      // ELOOP/ENOENT appropriately; other codes rethrow).
      throw err;
    }
  }
}

/**
 * Mutating operations must never target the data root itself (e.g. rm('.')
 * would delete the entire store). Reads may target the root; writes may not.
 * Compares against both the declared and canonical root (macOS /tmp →
 * /private/tmp) so a root spelled either way is rejected.
 */
function forbidRootTarget(
  path: StoragePath,
  abs: string,
  root: string,
  canonicalRoot: string,
): void {
  if (abs === root || abs === canonicalRoot) {
    throw new Error(`Invalid StoragePath: "${path}" — must not target the data root`);
  }
}

/**
 * LocalFileStore — maps the FileStore port over a vendored IFileSystem.
 * The ENGINE is `@file-services/node` (`createNodeFs()`, pinned at 11.1.1);
 * the adapter keeps ours — toAbsolute path guard, StoragePath → error
 * mapping, temp+rename atomic write, the recursive copy, and the
 * proper-lockfile binding.
 *
 * The IFileSystem is injected (constructor) so the contract suite can later
 * run against an in-memory adapter; the default is the node-backed engine.
 * Constructor performs no I/O — getDataRoot() is pure resolution.
 */
export class LocalFileStore implements FileStore {
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
