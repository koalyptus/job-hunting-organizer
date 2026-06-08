import lockfile, { type LockOptions } from 'proper-lockfile';
import type { AcquireLockOptions } from './types.js';

/**
 * Default retry and stale-detection knobs. Retries: 5 attempts with
 * 50–500 ms exponential backoff (so the worst-case wait is ~1.5 s).
 * `stale: 10_000` reclaims locks whose owner died without releasing,
 * a sensible default for short-lived CLI processes.
 */
const DEFAULT_OPTIONS: Required<AcquireLockOptions> = {
  retries: 5,
  minTimeout: 50,
  maxTimeout: 500,
  stale: 10_000,
};

/**
 * Translate a public {@link AcquireLockOptions} (retry count,
 * backoff bounds, stale ms) into the `proper-lockfile` shape. Use
 * this when you need to call `lockfile.lock` directly (e.g. inside
 * a custom retry loop). {@link acquireLock} and
 * {@link tryAcquireLock} call it for you.
 * @param overrides - User overrides; missing fields fall back to
 *   {@link DEFAULT_OPTIONS}.
 * @returns A `LockOptions` object safe to pass to `proper-lockfile`.
 */
export function lockOptions(overrides: AcquireLockOptions = {}): LockOptions {
  const merged: LockOptions = {
    retries: {
      retries: overrides.retries ?? DEFAULT_OPTIONS.retries,
      minTimeout: overrides.minTimeout ?? DEFAULT_OPTIONS.minTimeout,
      maxTimeout: overrides.maxTimeout ?? DEFAULT_OPTIONS.maxTimeout,
    },
    stale: overrides.stale ?? DEFAULT_OPTIONS.stale,
  };
  return merged;
}

/**
 * Run `fn` while holding an exclusive lock on `target`. The lock is
 * released in a `finally` so an exception in `fn` still frees it for
 * the next caller. Release errors are swallowed: the lockfile on
 * disk is the source of truth, and a double-release is harmless
 * because the second call is a no-op on the already-released file.
 *
 * The default retry/backoff is tuned for short interactive commands
 * (see {@link DEFAULT_OPTIONS}). Pass `retries: 0` to fail fast
 * instead — useful for tests that want to assert contention.
 * @param target - Path whose sidecar lock file guards the critical
 *   section (usually a directory).
 * @param fn - The work to perform under the lock.
 * @param options - Retry / backoff / stale overrides.
 * @returns The value returned by `fn`.
 */
export async function acquireLock<T>(
  target: string,
  fn: () => Promise<T>,
  options: AcquireLockOptions = {},
): Promise<T> {
  const opts = lockOptions(options);
  const release = await lockfile.lock(target, opts);
  try {
    return await fn();
  } finally {
    try {
      await release();
    } catch {
      // best effort
    }
  }
}

/**
 * Try to acquire the lock exactly once, returning a `release` thunk
 * on success or `null` on contention. Unlike {@link acquireLock} this
 * never retries: if the lock is held, you get `null` immediately so
 * the caller can decide whether to queue, abort, or fall back to a
 * read-only path.
 *
 * Only `ELOCKED` / `EAGAIN` are translated to `null`; other errors
 * (e.g. permission denied) bubble so the caller does not silently
 * proceed with a broken filesystem.
 * @param target - Path whose sidecar lock to take.
 * @param options - Stale timeout override. `retries` is ignored.
 * @returns A `release` thunk, or `null` if the lock is held.
 */
export async function tryAcquireLock(
  target: string,
  options: AcquireLockOptions = {},
): Promise<(() => Promise<void>) | null> {
  const opts: LockOptions = {
    retries: 0,
    stale: options.stale ?? DEFAULT_OPTIONS.stale,
  };
  let release: (() => Promise<void>) | undefined;
  try {
    release = await lockfile.lock(target, opts);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ELOCKED' || code === 'EAGAIN') {
      return null;
    }
    throw err;
  }
  return async () => {
    if (release === undefined) {
      return;
    }
    try {
      await release();
    } catch {
      // best effort
    }
  };
}

/**
 * Re-export of `proper-lockfile` so consumers can do
 * `import { lockfile } from '../core/locks.js'` without depending on
 * the upstream package directly. Avoids version drift in transitive
 * imports.
 */
export { lockfile };
