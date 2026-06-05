import lockfile, { type LockOptions } from 'proper-lockfile';
import type { AcquireLockOptions } from './types.js';

const DEFAULT_OPTIONS: Required<AcquireLockOptions> = {
  retries: 5,
  minTimeout: 50,
  maxTimeout: 500,
  stale: 10_000,
};

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

export async function tryAcquireLock(
  target: string,
  options: AcquireLockOptions = {},
): Promise<(() => Promise<void>) | null> {
  const opts: LockOptions = {
    retries: 0,
    stale: options.stale ?? DEFAULT_OPTIONS.stale,
  };
  let release: () => Promise<void> | undefined;
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

export { lockfile };
