import type { IFileSystem } from '@file-services/types';
import type { StoragePath } from '../types.js';

/** A StoragePath must be relative — reject Windows drive letters (`C:`). `fs.isAbsolute` already catches these on Windows; this also guards POSIX. */
const STORAGEPATH_NO_DRIVE = /^[a-zA-Z]:/;

/**
 * Normalize a StoragePath to an absolute path under root, rejecting absolute
 * paths, "..", drive letters, and any resolved escape (including via symlinks).
 * An empty / "." path resolves to the root itself (reads may list the root);
 * mutating ops separately call forbidRootTarget. Path arithmetic uses the
 * engine's path API — no `node:path` imports under src/storage/.
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

/** Canonicalize the data root once; macOS keeps /tmp (and /var/folders) as a symlink to /private/..., so the on-disk path differs from the declared one. */
export function canonicalizeRoot(fs: IFileSystem, root: string): string {
  try {
    return fs.realpathSync(root);
  } catch {
    return root;
  }
}

/**
 * Confirm `abs` stays under root. The literal check uses the declared root
 * (a symlinked root like /tmp → /private/tmp is fine); the realpath walk uses
 * the canonical root so a symlink *inside* the root pointing *outside* is
 * caught. The walk canonicalizes the deepest existing ancestor (a not-yet-
 * existing write target throws ENOENT, so we walk up; an ELOOP cycle surfaces
 * as-is).
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

/** Mutating ops must never target the root itself (e.g. rm('.') would delete the store). Reads may target the root; writes may not. */
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
