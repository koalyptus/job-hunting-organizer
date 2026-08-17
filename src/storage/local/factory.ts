import type { FileStore } from '../types.js';
import { LocalFileStore } from './local-file-store.js';
import { MemoryFileStore } from '../memory.js';

/**
 * Factory — builds a FileStore over the data root.
 *
 * Co-located with `LocalFileStore` because it constructs that adapter
 * directly (no adapter-selection logic yet). If a future adapter (e.g. an
 * in-memory store for tests) needs choosing, this is where the selection
 * would live, and at that point it may move up to `storage/factory.ts`.
 *
 * Kept as an explicit factory (not a module-level singleton/global) so each
 * entry point constructs the store once at startup and threads the returned
 * `FileStore` into command/tool constructors. That keeps store creation in
 * one place and the wiring under the caller's control.
 *
 * configHome is deliberately NOT routed through the port: `config.json`
 * holds credentials and logs and is local-only by definition, so
 * `config.ts`/`logs.ts` stay on direct fs.
 */
export type CreateStoreOptions =
  | { inMemory: true }
  | { inMemory?: false; dataRoot?: string }
  | string
  | undefined;

export function createStore(options?: CreateStoreOptions): FileStore {
  // String argument → LocalFileStore over that data root (legacy call sites).
  if (typeof options === 'string') {
    return new LocalFileStore(options);
  }
  // Object argument with inMemory:true → in-memory store for tests.
  if (options && typeof options !== 'string' && options.inMemory === true) {
    return new MemoryFileStore();
  }
  // Object argument with optional dataRoot, or no argument → LocalFileStore.
  const dataRoot =
    options && typeof options !== 'string' && 'dataRoot' in options ? options.dataRoot : undefined;
  return new LocalFileStore(dataRoot);
}
