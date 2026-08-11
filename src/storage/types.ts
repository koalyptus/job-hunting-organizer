export type StoragePath = string;

export type StorageEntryKind = 'file' | 'directory';

export interface StorageStat {
  readonly kind: StorageEntryKind;
  readonly size: number;
  readonly mtimeMs: number;
}

export interface ReadDirOptions {
  readonly includeSpecialEntries?: boolean;
}

export class StorageNotFoundError extends Error {
  constructor(public readonly path: StoragePath) {
    super(`Not found: ${path}`);
    this.name = 'StorageNotFoundError';
  }
}

export class StorageAlreadyExistsError extends Error {
  constructor(public readonly path: StoragePath) {
    super(`Already exists: ${path}`);
    this.name = 'StorageAlreadyExistsError';
  }
}

export class StorageNotEmptyError extends Error {
  constructor(public readonly path: StoragePath) {
    super(`Directory not empty: ${path}`);
    this.name = 'StorageNotEmptyError';
  }
}

export class StorageUnsupportedError extends Error {
  constructor(
    public readonly operation: string,
    public readonly path: StoragePath,
  ) {
    super(`Unsupported operation '${operation}' on ${path}`);
    this.name = 'StorageUnsupportedError';
  }
}

export interface FileStore {
  read(path: StoragePath): Promise<string>;
  readBytes(path: StoragePath): Promise<Uint8Array>;
  write(path: StoragePath, content: string | Uint8Array): Promise<void>;
  append(path: StoragePath, content: string | Uint8Array): Promise<void>;
  exists(path: StoragePath): Promise<boolean>;
  stat(path: StoragePath): Promise<StorageStat>;
  readdir(path: StoragePath, options?: ReadDirOptions): Promise<StoragePath[]>;
  mkdir(path: StoragePath): Promise<void>;
  rename(from: StoragePath, to: StoragePath): Promise<void>;
  rm(path: StoragePath, options?: { readonly recursive?: boolean }): Promise<void>;
  copy(from: StoragePath, to: StoragePath): Promise<void>;
  withLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
  joinPath(...parts: string[]): StoragePath;
  getDataRoot(): string;
}
