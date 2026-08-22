export type {
  FileStore,
  StoragePath,
  StorageEntryKind,
  StorageStat,
  ReadDirOptions,
  StorageNotFoundError,
  StorageAlreadyExistsError,
  StorageNotEmptyError,
  StorageUnsupportedError,
} from './types.js';

// `resolveDataRoot` is re-exported from `lib/paths.js` (single source of
// truth for the data root and the `$JHO_DATA` override). The adapter does
// not re-implement it.
export { LocalFileStore, resolveDataRoot } from './local/local-file-store.js';
export { createStore } from './local/factory.js';
export type { CreateStoreOptions } from './local/factory.js';
export { MemoryFileStore } from './memory.js';
