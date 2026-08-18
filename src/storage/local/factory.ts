import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { FileStore } from '../types.js';
import { LocalFileStore } from './local-file-store.js';
import { MemoryFileStore } from '../memory.js';
import { resolveDataRoot } from '../../core/paths.js';

/**
 * Factory — builds a FileStore over the data root.
 *
 * Co-located with `LocalFileStore` because it constructs that adapter
 * directly. Adapter selection logic lives here: string/dataRoot arguments
 * return LocalFileStore; `{inMemory: true}` returns MemoryFileStore.
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
  if (options?.inMemory === true) {
    return new MemoryFileStore();
  }
  // Object argument with optional dataRoot, or no argument → LocalFileStore.
  const dataRoot = options?.dataRoot;
  return new LocalFileStore(dataRoot);
}

/**
 * Resolve the absolute data root used by the store factory. Exposed so a
 * caller can build a campaign-scoped store that shares the same resolved
 * root (honouring `$JHO_DATA`) without re-implementing the resolution.
 * @returns The absolute data-root path.
 */
function dataRootForStore(): string {
  return resolveDataRoot();
}

/**
 * Build a campaign-scoped `FileStore` rooted at
 * `<dataRoot>/campaigns/<name>` (the campaign's own directory, NOT the
 * campaigns parent). Campaign operations pass the returned store into the
 * port surface (`read('profile.md')`, `write('knowledge-base/cv.json')`, …)
 * instead of computing absolute paths + touching `node:fs` directly.
 *
 * The campaigns directory is created if missing — a fresh `jho init` must
 * be able to write into a not-yet-existing `<dataRoot>/campaigns/` without
 * a preceding bootstrap step. A campaign store that points at a not-yet-
 * existing campaign folder is still safe: reads miss, writes create it.
 *
 * @param campaign - Campaign folder name (already validated by the caller; the
 *   store does not re-validate naming).
 * @param options - Optional explicit data root (used by tests to pass a real
 *   temp dir) or `{ inMemory: true }` for a fully in-memory campaign store.
 * @returns A `FileStore` whose data root is the campaign directory.
 */
export function campaignStore(
  campaign: string,
  options?: { dataRoot?: string; inMemory?: boolean },
): FileStore {
  if (options?.inMemory === true) {
    return new MemoryFileStore();
  }
  const dataRoot = options?.dataRoot ?? dataRootForStore();
  const campaignsRoot = join(dataRoot, 'campaigns');
  // Lazily ensure the campaigns parent so a brand-new campaign can be
  // written without requiring a prior bootstrap step.
  if (!existsSync(campaignsRoot)) {
    mkdirSync(campaignsRoot, { recursive: true });
  }
  const campaignRoot = join(campaignsRoot, campaign);
  return new LocalFileStore(campaignRoot);
}

/**
 * Build a campaign-scoped `FileStore` from an already-resolved absolute
 * campaign root (e.g. one inferred from cwd). Equivalent to
 * {@link campaignStore} but for the callers that hold a campaign *directory*
 * rather than a campaign *name* — the store root is the directory itself.
 *
 * @param root - Absolute path to the campaign directory.
 * @returns A `FileStore` whose data root is `root`.
 */
export function campaignStoreFromRoot(root: string): FileStore {
  return new LocalFileStore(root);
}

/**
 * Build a `FileStore` rooted at the campaigns *parent* directory
 * (`<dataRoot>/campaigns/`). Used for operations that act across campaigns
 * within that folder — notably renaming one campaign folder to another —
 * without escaping the store root.
 *
 * @param dataRoot - Optional explicit data root (defaults to the resolved
 *   `$JHO_DATA` root).
 * @returns A `FileStore` whose data root is the campaigns directory.
 */
export function campaignsStore(dataRoot?: string): FileStore {
  const root = dataRoot ?? dataRootForStore();
  return new LocalFileStore(join(root, 'campaigns'));
}
