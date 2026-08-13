/**
 * A storage path: a RELATIVE path in the engine's host-native format
 * (POSIX `/` on Linux/macOS, `\` on Windows — the same convention Node's
 * `node:path` uses). Callers must pass relative paths; absolute paths,
 * `..` segments, and Windows drive letters are rejected at the boundary.
 * The port does not re-separate or normalize paths — it delegates to the
 * injected file system's own path API.
 */
export type StoragePath = string;

/**
 * A filesystem entry kind.
 */
export type StorageEntryKind = 'file' | 'directory';

/**
 * Portable stat result. Mirrors the vendor's `IFileSystemStats` shape
 * (mtime as a `Date`, like Node's `fs.Stats`) rather than re-casting it,
 * so the adapter passes the engine result through unchanged.
 */
export interface StorageStat {
  readonly kind: StorageEntryKind;
  readonly size: number;
  readonly mtime: Date;
}

/**
 * Options for `readdir`.
 */
export interface ReadDirOptions {
  /** Include `.` and `..` entries (default: false). */
  readonly includeSpecialEntries?: boolean;
}

/**
 * Error raised when a storage path does not exist.
 */
export class StorageNotFoundError extends Error {
  constructor(public readonly path: StoragePath) {
    super(`Not found: ${path}`);
    this.name = 'StorageNotFoundError';
  }
}

/**
 * Error raised when a storage path already exists.
 */
export class StorageAlreadyExistsError extends Error {
  constructor(public readonly path: StoragePath) {
    super(`Already exists: ${path}`);
    this.name = 'StorageAlreadyExistsError';
  }
}

/**
 * Error raised when removing a non-empty directory without `recursive`.
 */
export class StorageNotEmptyError extends Error {
  constructor(public readonly path: StoragePath) {
    super(`Directory not empty: ${path}`);
    this.name = 'StorageNotEmptyError';
  }
}

/**
 * Error raised when an operation is not supported by the storage backend.
 */
export class StorageUnsupportedError extends Error {
  constructor(
    public readonly operation: string,
    public readonly path: StoragePath,
  ) {
    super(`Unsupported operation '${operation}' on ${path}`);
    this.name = 'StorageUnsupportedError';
  }
}

/**
 * Storage port — filesystem abstraction decoupling core logic from
 * persistence. All paths are `StoragePath` (relative POSIX, no leading
 * slash, no `..`, no drive letters). Implementations must enforce
 * root confinement and map engine errors to the port's error classes.
 */
export interface FileStore {
  /** Read a file as UTF-8 string. */
  read(path: StoragePath): Promise<string>;
  /** Read a file as raw bytes. */
  readBytes(path: StoragePath): Promise<Uint8Array>;
  /** Write a file (atomic via temp + rename). Creates parent dirs. */
  write(path: StoragePath, content: string | Uint8Array): Promise<void>;
  /** Append to a file (atomic, single engine call). Creates parent dirs. */
  append(path: StoragePath, content: string | Uint8Array): Promise<void>;
  /** Check if a path exists. */
  exists(path: StoragePath): Promise<boolean>;
  /** Get portable stat for a path. */
  stat(path: StoragePath): Promise<StorageStat>;
  /** List directory entries (filters `.` and `..` by default). */
  readdir(path: StoragePath, options?: ReadDirOptions): Promise<StoragePath[]>;
  /** Create a directory (recursive, idempotent for existing dirs). */
  mkdir(path: StoragePath): Promise<void>;
  /** Rename/move a path (source must exist, dest must not). */
  rename(from: StoragePath, to: StoragePath): Promise<void>;
  /** Remove a path (file, empty dir, or recursive tree). */
  rm(path: StoragePath, options?: { readonly recursive?: boolean }): Promise<void>;
  /** Copy a file or directory tree. */
  copy(from: StoragePath, to: StoragePath): Promise<void>;
  /** Advisory lock on a key — serializes concurrent holders. */
  withLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
  /** Return the absolute data root this store operates under. */
  getDataRoot(): string;
}
