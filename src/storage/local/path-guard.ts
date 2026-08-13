import type { IFileSystem } from '@file-services/types';
import type { StoragePath } from '../types.js';

/** Rejects Windows drive letters (`C:`), which `fs.isAbsolute` does not treat as absolute on every platform. */
const STORAGEPATH_NO_DRIVE = /^[a-zA-Z]:/;

/**
 * Resolve a StoragePath to an absolute path under `root`, rejecting absolute
 * paths, `".."`, drive letters, and any resolved escape (incl. via symlinks).
 * Empty / `"."` resolves to `root` itself.
 * @param fs - the injected file system.
 * @param root - the data root all paths are confined to.
 * @param path - relative storage path to resolve.
 * @returns the absolute host path.
 */
export function toAbsolute(fs: IFileSystem, root: string, path: StoragePath): string {
  if (fs.isAbsolute(path) || path.startsWith('..') || STORAGEPATH_NO_DRIVE.test(path)) {
    throw new Error(
      `Invalid StoragePath: "${path}" — must be relative (host-native), no absolute paths, no '..', no drive letters`,
    );
  }
  const abs = fs.resolve(root, path);
  const canonicalRoot = canonicalizeRoot(fs, root);
  assertWithinRoot(fs, root, canonicalRoot, abs, path);
  return abs;
}

/**
 * Canonical form of `root` (realpath). macOS keeps /tmp (and /var/folders) as a
 * symlink to /private/..., so the on-disk path differs from the declared one.
 * @param fs - the injected file system.
 * @param root - the data root to canonicalize.
 * @returns the realpath, or `root` unchanged if it does not exist.
 */
export function canonicalizeRoot(fs: IFileSystem, root: string): string {
  try {
    return fs.realpathSync(root);
  } catch {
    return root;
  }
}

/**
 * Assert `abs` stays under `root`. The literal check uses the declared root (a
 * symlinked root like /tmp → /private/tmp is fine); the realpath walk uses the
 * canonical root so a symlink *inside* the root pointing *outside* is caught.
 * The walk canonicalizes the deepest existing ancestor (an ENOENT/ENOTDIR target
 * walks up; an ELOOP cycle surfaces as-is).
 * @param fs - the injected file system.
 * @param root - the declared data root.
 * @param canonicalRoot - the canonical (realpath) data root.
 * @param abs - the resolved absolute path to check.
 * @param path - the original storage path (for error messages).
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
        const parent = fs.dirname(dir);
        if (parent === dir || parent === root) {
          return;
        }
        dir = parent;
        continue;
      }
      throw err;
    }
  }
}

/**
 * Reject a path that resolves to the root itself (e.g. `rm('.')` would delete
 * the whole store). Reads may target the root; mutating ops must not.
 * @param path - the original storage path (for error messages).
 * @param abs - the resolved absolute path.
 * @param root - the declared data root.
 * @param canonicalRoot - the canonical (realpath) data root.
 */
export function forbidRootTarget(
  path: StoragePath,
  abs: string,
  root: string,
  canonicalRoot: string,
): void {
  if (abs === root || abs === canonicalRoot) {
    throw new Error(`Invalid StoragePath: "${path}" — must not target the data root`);
  }
}
