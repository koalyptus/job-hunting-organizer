import { chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { acquireLock, lockOptions, tryAcquireLock } from '../locks.js';

describe('lockOptions', () => {
  it('uses sensible defaults', () => {
    const opts = lockOptions();
    expect(opts.stale).toBe(10_000);
    expect(opts.retries).toBeDefined();
  });

  it('respects overrides', () => {
    const opts = lockOptions({ retries: 2, minTimeout: 10, maxTimeout: 100, stale: 1000 });
    expect(opts.stale).toBe(1000);
  });
});

describe('acquireLock', () => {
  let workDir: string;
  let target: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-locks-'));
    target = join(workDir, 'locked.txt');
    await writeFile(target, 'x');
  });

  afterEach(async () => {
    await chmod(workDir, 0o755).catch(() => {});
    await rm(workDir, { recursive: true, force: true });
  });

  it('runs the function and returns its result', async () => {
    const result = await acquireLock(target, async () => 7);
    expect(result).toBe(7);
  });

  it('serializes concurrent access to the same target', async () => {
    const order: number[] = [];
    let aInLock: (() => void) | undefined;
    const aHasLock = new Promise<void>((r) => {
      aInLock = r;
    });

    const a = acquireLock(
      target,
      async () => {
        order.push(1);
        aInLock?.();
        await new Promise((r) => setTimeout(r, 50));
        order.push(2);
      },
      { retries: 10, minTimeout: 10, maxTimeout: 50 },
    );

    await aHasLock;

    const b = acquireLock(
      target,
      async () => {
        order.push(3);
      },
      { retries: 10, minTimeout: 10, maxTimeout: 50 },
    );

    await Promise.all([a, b]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('releases the lock even when the function throws', async () => {
    await expect(
      acquireLock(target, async () => {
        throw new Error('nope');
      }),
    ).rejects.toThrow('nope');
    // a fresh lock should succeed immediately
    const result = await acquireLock(target, async () => 'ok');
    expect(result).toBe('ok');
  });

  it('handles release failure in acquireLock gracefully', async () => {
    const result = await acquireLock(target, async () => {
      await chmod(workDir, 0o444);
      return 'ok';
    });
    expect(result).toBe('ok');
    await chmod(workDir, 0o755);
  });
});

describe('tryAcquireLock', () => {
  let workDir: string;
  let target: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-locks-'));
    target = join(workDir, 'locked.txt');
    await writeFile(target, 'x');
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('returns a release function on success', async () => {
    const release = await tryAcquireLock(target);
    expect(release).not.toBeNull();
    await release!();
  });

  it('returns null when the target is already locked', async () => {
    const release1 = await tryAcquireLock(target);
    expect(release1).not.toBeNull();
    const release2 = await tryAcquireLock(target);
    expect(release2).toBeNull();
    await release1!();
  });

  it('re-throws non-contention errors from lockfile.lock', async () => {
    await expect(tryAcquireLock(join(workDir, 'nonexistent-subdir', 'lock'))).rejects.toThrow();
  });

  it('handles release failure gracefully', async () => {
    const release = await tryAcquireLock(target);
    expect(release).not.toBeNull();

    await chmod(workDir, 0o444);

    await release!();

    await chmod(workDir, 0o755);
  });
});
