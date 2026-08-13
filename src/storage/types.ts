/**
 * A storage path: a RELATIVE path in the engine's host-native format
 * (the same convention Node's `node:path` uses). Callers must pass relative
 * paths; absolute paths, `..` segments, and Windows drive letters are rejected
 * at the boundary. The port does not re-separate or normalize paths — it
 * delegates to the injected file system's own path API.
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
 * persistence. All paths are `StoragePath` (relative, host-native, no leading
 * slash, no `..`, no drive letters). Implementations must enforce
 * root confinement and map engine errors to the port's error classes.
 */
export interface FileStore {
  /**
   * Read a file as a UTF-8 string.
   * @param path - relative storage path to read.
   * @throws {StorageNotFoundError} if the path does not exist.
   */
  read(path: StoragePath): Promise<string>;

  /**
   * Read a file as raw bytes.
   * @param path - relative storage path to read.
   * @throws {StorageNotFoundError} if the path does not exist.
   */
  readBytes(path: StoragePath): Promise<Uint8Array>;

  /**
   * Write a file (atomic via temp + rename); creates parent directories.
   * @param path - relative storage path to write.
   * @param content - string or binary content to write.
   */
  write(path: StoragePath, content: string | Uint8Array): Promise<void>;

  /**
   * Append to a file (atomic, single engine call); creates parent directories.
   * @param path - relative storage path to append to.
   * @param content - string or binary content to append.
   */
  append(path: StoragePath, content: string | Uint8Array): Promise<void>;

  /**
   * Check whether a path exists.
   * @param path - relative storage path to check.
   * @returns true if the path exists, false otherwise.
   */
  exists(path: StoragePath): Promise<boolean>;

  /**
   * Get a portable stat for a path.
   * @param path - relative storage path to stat.
   * @throws {StorageNotFoundError} if the path does not exist.
   */
  stat(path: StoragePath): Promise<StorageStat>;

  /**
   * List directory entries (`.` and `..` filtered by default).
   * @param path - relative storage path of the directory.
   * @param options - optional readdir options (e.g. include special entries).
   * @returns the directory entry names.
   */
  readdir(path: StoragePath, options?: ReadDirOptions): Promise<StoragePath[]>;

  /**
   * Create a directory (recursive, idempotent for an existing directory).
   * @param path - relative storage path of the directory to create.
   * @throws {StorageAlreadyExistsError} if the path is an existing file.
   */
  mkdir(path: StoragePath): Promise<void>;

  /**
   * Rename/move a path.
   * @param from - source relative storage path (must exist).
   * @param to - destination relative storage path (must not exist).
   */
  rename(from: StoragePath, to: StoragePath): Promise<void>;

  /**
   * Remove a path (a file, an empty directory, or a recursive tree).
   * @param path - relative storage path to remove.
   * @param options - optional; pass `{ recursive: true }` to remove a tree.
   */
  rm(path: StoragePath, options?: { readonly recursive?: boolean }): Promise<void>;

  /**
   * Copy a file or directory tree.
   * @param from - source relative storage path (must exist).
   * @param to - destination relative storage path (must not exist).
   */
  copy(from: StoragePath, to: StoragePath): Promise<void>;

  /**
   * Advisory lock on a key — serializes concurrent holders.
   * @param key - lock key identifying the critical section.
   * @param fn - async critical section; runs while the lock is held.
   * @returns the value returned by `fn`.
   */
  withLock<T>(key: string, fn: () => Promise<T>): Promise<T>;

  /**
   * Return the absolute data root this store operates under.
   * @returns the store's data-root absolute path.
   */
  getDataRoot(): string;
}
