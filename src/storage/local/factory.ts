import type { FileStore } from '../types.js';
import { LocalFileStore } from './file-store.js';

/**
 * Factory — builds a LocalFileStore over the data root.
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
export function createStore(dataRoot?: string): FileStore {
  return new LocalFileStore(dataRoot);
}
