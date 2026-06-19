import { copyFile, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { getRootLogger } from './logger.js';
import type { AtomicWriteOptions, WithBackupOptions } from './types.js';

/**
 * Build a unique sibling temp path for {@link atomicWrite}. The
 * filename encodes PID, wall-clock time, and 6 random bytes so two
 * concurrent writers to the same target almost never collide, and a
 * crash mid-write never leaves a real file named `<target>.tmp`.
 * @param target - The absolute path of the final file.
 * @returns A sibling path with the `.tmp` suffix and disambiguators.
 */
function generateTempName(target: string): string {
  const suffix = randomBytes(6).toString('hex');
  return `${target}.${process.pid}.${Date.now()}.${suffix}.tmp`;
}

/**
 * `mkdir -p` the parent of `target` if `ensureDir` is set. No-op
 * otherwise; callers that want strict "do not create" semantics can
 * pass `ensureDir: false` to detect missing directories.
 * @param target - The file path whose parent we may create.
 * @param ensureDir - When `false`, do nothing.
 */
async function ensureParentDir(target: string, ensureDir: boolean): Promise<void> {
  if (!ensureDir) {
    return;
  }
  await mkdir(dirname(target), { recursive: true });
}

/**
 * Write `content` to `target` atomically. The flow is:
 *   1. Resolve to an absolute path.
 *   2. Optionally `mkdir -p` the parent.
 *   3. Write to a unique sibling temp file.
 *   4. `rename` the temp over the target.
 *
 * `rename` is atomic on POSIX and on modern Windows (Node ≥ 14), so
 * a process crash at any step either leaves the previous file intact
 * (steps 1–3) or completes the new file (step 4). Half-written data
 * is never visible at `target`.
 *
 * Concurrent writers to the same `target` are still possible — pair
 * with a `proper-lockfile` lock from `./locks.js` when two processes
 * can race.
 * @param target - Destination path. Created or overwritten.
 * @param content - The bytes to write. `string` uses the configured
 *   encoding; `Uint8Array` is written verbatim.
 * @param options - Encoding, file mode, and whether to auto-create
 *   the parent directory.
 * @returns `true` on success, `false` on failure.
 */
export async function atomicWrite(
  target: string,
  content: string | Uint8Array,
  options: AtomicWriteOptions = {},
): Promise<boolean> {
  const { encoding = 'utf8', mode, ensureDir = true } = options;
  try {
    const resolved = isAbsolute(target) ? target : resolve(target);
    await ensureParentDir(resolved, ensureDir);

    const tmp = generateTempName(resolved);
    await writeFile(tmp, content, { encoding, mode });
    await rename(tmp, resolved);
    return true;
  } catch (err) {
    getRootLogger().debug({ err, target }, 'atomicWrite failed');
    return false;
  }
}

/**
 * Test whether a path exists. Resolves to `true` for files,
 * directories, sockets, and any other entry the OS can `stat`. Only
 * `ENOENT` and `ENOTDIR` resolve to `false`; permission errors and
 * other failures bubble.
 * @param target - The path to test.
 * @returns `true` if the path exists and is stat-able.
 */
export async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return false;
    }
    throw err;
  }
}

/**
 * Run `fn` with a safety net: if the file at `target` exists, copy
 * it to `<target><backupSuffix>` first. If `fn` throws, restore the
 * backup over `target` and re-throw. The backup is removed in a
 * `finally` so a successful call also leaves the tree clean.
 *
 * Use this for one-off destructive operations (e.g. in-place
 * frontmatter migration) where losing the prior content on failure
 * would be worse than leaving a `.bak` behind temporarily.
 * @param target - The file about to be touched.
 * @param fn - The work to perform while the backup is live.
 * @param options - Backup suffix; defaults to `.bak`.
 * @returns The value returned by `fn`.
 */
export async function withBackup<T>(
  target: string,
  fn: () => Promise<T>,
  options: WithBackupOptions = {},
): Promise<T> {
  const { backupSuffix = '.bak' } = options;
  const exists = await pathExists(target);
  const backup = `${target}${backupSuffix}`;
  if (exists) {
    await copyFile(target, backup);
  }
  try {
    return await fn();
  } catch (err) {
    if (exists) {
      await rm(target, { force: true });
      await rename(backup, target);
    }
    throw err;
  } finally {
    if (exists) {
      await rm(backup, { force: true });
    }
  }
}
