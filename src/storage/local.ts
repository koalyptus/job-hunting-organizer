import { dirname, isAbsolute, join as pathJoin, relative, resolve } from 'node:path';
import {
  appendFile,
  mkdir,
  readFile,
  rmdir,
  stat,
  unlink,
  writeFile,
  rename,
  readdir,
} from 'node:fs/promises';
import type { FileStore, StoragePath, StorageStat, ReadDirOptions } from './types.js';
import { StorageNotFoundError, StorageAlreadyExistsError, StorageNotEmptyError } from './types.js';
import { getRootLogger } from '../core/logger/logger.js';
import { resolveDataRoot } from '../core/paths.js';

const log = getRootLogger().child({ module: 'LocalFileStore' });

/**
 * Re-export the canonical data-root resolver so the storage module is a
 * self-contained entry point. The real implementation lives in
 * `core/paths.ts` (single source of truth for `~/.job-hunting-organizer-data`
 * and the `$JHO_DATA` override); we do not re-implement it here.
 */
export { resolveDataRoot };

/**
 * Normalize a StoragePath to an absolute host path under the data root.
 * Validates: no leading slash, no `..`, no drive letters.
 */
function toAbsolute(root: string, path: StoragePath): string {
  if (path === '') {
    return root;
  }
  if (path.startsWith('/') || path.startsWith('..') || /^[a-zA-Z]:/.test(path)) {
    throw new Error(
      `Invalid StoragePath: "${path}" — must be relative POSIX, no leading slash, no '..', no drive letters`,
    );
  }
  const abs = resolve(root, path);
  // Ensure we don't escape the root (defense in depth)
  const rel = relative(root, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`Path escapes data root: "${path}"`);
  }
  return abs;
}

/**
 * Convert a Node `fs.Stats` to our portable `StorageStat`.
 */
function toStorageStat(stats: {
  isFile(): boolean;
  isDirectory(): boolean;
  size: number;
  mtimeMs: number;
}): StorageStat {
  return {
    kind: stats.isDirectory() ? 'directory' : 'file',
    size: stats.size,
    mtimeMs: stats.mtimeMs,
  };
}

/**
 * LocalFileStore — thin wrapper over node:fs/promises.
 * This adapter absorbs the logic of src/core/fs.ts and src/core/locks.ts.
 * The temp+rename atomic-write helper stays ours.
 */
export class LocalFileStore implements FileStore {
  private readonly dataRoot: string;

  constructor(dataRoot?: string) {
    this.dataRoot = dataRoot ?? resolveDataRoot();
  }

  getDataRoot(): string {
    return this.dataRoot;
  }

  joinPath(...parts: string[]): StoragePath {
    // POSIX join: normalize segments, filter empty, join with '/'
    const segments = parts.flatMap((p) => p.split('/')).filter(Boolean);
    return segments.join('/');
  }

  async read(path: StoragePath): Promise<string> {
    const abs = toAbsolute(this.dataRoot, path);
    try {
      return await readFile(abs, 'utf8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        throw new StorageNotFoundError(path);
      }
      throw err;
    }
  }

  async readBytes(path: StoragePath): Promise<Uint8Array> {
    const abs = toAbsolute(this.dataRoot, path);
    try {
      return await readFile(abs);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        throw new StorageNotFoundError(path);
      }
      throw err;
    }
  }

  async write(path: StoragePath, content: string | Uint8Array): Promise<void> {
    const abs = toAbsolute(this.dataRoot, path);
    const parent = dirname(abs);

    // Ensure parent directory exists
    try {
      await mkdir(parent, { recursive: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw err;
      }
    }

    // Temp + rename for atomicity
    const tmp = `${abs}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    try {
      await writeFile(tmp, content);
      await rename(tmp, abs);
    } catch (err) {
      // Cleanup temp on failure
      try {
        await unlink(tmp);
      } catch {
        // Ignore cleanup errors
      }
      throw err;
    }
  }

  async append(path: StoragePath, content: string | Uint8Array): Promise<void> {
    const abs = toAbsolute(this.dataRoot, path);
    const parent = dirname(abs);
    try {
      await mkdir(parent, { recursive: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw err;
      }
    }
    await appendFile(abs, content);
  }

  async exists(path: StoragePath): Promise<boolean> {
    const abs = toAbsolute(this.dataRoot, path);
    try {
      await stat(abs);
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
    const abs = toAbsolute(this.dataRoot, path);
    try {
      const stats = await stat(abs);
      return toStorageStat(stats);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        throw new StorageNotFoundError(path);
      }
      throw err;
    }
  }

  async readdir(path: StoragePath, options?: ReadDirOptions): Promise<StoragePath[]> {
    const abs = toAbsolute(this.dataRoot, path);
    try {
      const entries = await readdir(abs);
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
    const abs = toAbsolute(this.dataRoot, path);
    try {
      await mkdir(abs, { recursive: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') {
        // Check if it's a file — that's an error per contract
        const stats = await stat(abs);
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
    const src = toAbsolute(this.dataRoot, from);
    const dest = toAbsolute(this.dataRoot, to);

    // Check source exists
    try {
      await stat(src);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        throw new StorageNotFoundError(from);
      }
      throw err;
    }

    // Check destination doesn't exist
    try {
      await stat(dest);
      throw new StorageAlreadyExistsError(to);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        throw err;
      }
    }

    // Ensure dest parent exists
    const destParent = dirname(dest);
    try {
      await mkdir(destParent, { recursive: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw err;
      }
    }

    await rename(src, dest);
  }

  async rm(path: StoragePath, options?: { readonly recursive?: boolean }): Promise<void> {
    const abs = toAbsolute(this.dataRoot, path);
    try {
      const stats = await stat(abs);
      if (stats.isDirectory()) {
        if (!options?.recursive) {
          // Check if empty
          const entries = await readdir(abs);
          if (entries.length > 0) {
            throw new StorageNotEmptyError(path);
          }
        }
        await rmdir(abs, { recursive: options?.recursive ?? false });
      } else {
        await unlink(abs);
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
    const src = toAbsolute(this.dataRoot, from);
    const dest = toAbsolute(this.dataRoot, to);

    // Check destination doesn't exist
    try {
      await stat(dest);
      throw new StorageAlreadyExistsError(to);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        throw err;
      }
    }

    // Ensure dest parent exists
    const destParent = dirname(dest);
    try {
      await mkdir(destParent, { recursive: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw err;
      }
    }

    await this.copyRecursive(src, dest);
  }

  private async copyRecursive(src: string, dest: string): Promise<void> {
    const stats = await stat(src);
    if (stats.isDirectory()) {
      await mkdir(dest, { recursive: true });
      const entries = await readdir(src);
      for (const entry of entries) {
        await this.copyRecursive(pathJoin(src, entry), pathJoin(dest, entry));
      }
    } else {
      const data = await readFile(src);
      await writeFile(dest, data);
    }
  }

  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // Use proper-lockfile for advisory locking (same as src/core/locks.ts)
    // Lock on a sidecar file under the data root's .locks/ directory
    const lockDir = pathJoin(this.dataRoot, '.locks');
    await mkdir(lockDir, { recursive: true });
    const lockFile = pathJoin(lockDir, `${key.replace(/[\W]/g, '_')}.lock`);
    // Use proper-lockfile via dynamic import to avoid hard dependency in types
    const lockfile = await import('proper-lockfile');
    const release = await lockfile.default.lock(lockFile, {
      retries: { retries: 5, minTimeout: 50, maxTimeout: 500 },
      stale: 10_000,
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

/**
 * Factory function — returns a singleton LocalFileStore over the data root.
 * One store instance, data root only. configHome is deliberately NOT routed
 * through the port (config.json holds creds/logs; local-only by definition;
 * config.ts and logs.ts stay on direct fs).
 */
let storeInstance: LocalFileStore | null = null;

export function createStore(dataRoot?: string): FileStore {
  if (!storeInstance) {
    storeInstance = new LocalFileStore(dataRoot);
  }
  return storeInstance;
}

/**
 * Get the singleton store instance, creating it on first call. Use this at
 * process bootstrap (CLI / MCP startup) to prove the wiring; downstream
 * phases thread the returned `FileStore` explicitly into constructors rather
 * than re-calling this (no module-level provider/global in core code).
 */
export function getStore(dataRoot?: string): FileStore {
  return createStore(dataRoot);
}
