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

// `resolveDataRoot` is re-exported from `core/paths.js` (single source of
// truth for the data root and the `$JHO_DATA` override). The adapter does
// not re-implement it.
export { LocalFileStore, resolveDataRoot, createStore, getStore } from './local.js';
