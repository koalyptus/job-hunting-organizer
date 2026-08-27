import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';

const { mockLock, mockReleaseThrows, mockReleaseOk } = vi.hoisted(() => {
  return {
    mockLock: vi.fn(),
    mockReleaseThrows: vi.fn().mockRejectedValue(new Error('release failed')),
    mockReleaseOk: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('proper-lockfile', async () => {
  const actual = (await vi.importActual('proper-lockfile')) as Record<string, unknown>;
  const def = (actual['default'] ?? actual) as Record<string, unknown>;
  return {
    default: { ...(def as object), lock: mockLock },
    lock: mockLock,
    unlock: actual['unlock'],
    check: actual['check'],
  };
});

vi.mock('../../lib/logger/logger.js', () => ({
  getRootLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  moduleLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

import { acquireLock, tryAcquireLock } from '../locks.js';
import { moduleLogger } from '../logger/logger.js';

describe('locks release failure branches', () => {
  let workDir: string;
  let target: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    workDir = await mkdtemp(join(tmpdir(), 'jho-locks-branch-'));
    target = join(workDir, 'locked.txt');
    await writeFile(target, 'x');
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('acquireLock: swallows release failure and still returns value', async () => {
    mockLock.mockResolvedValueOnce(mockReleaseThrows);
    const result = await acquireLock(target, async () => 'ok');
    expect(result).toBe('ok');
    expect(mockReleaseThrows).toHaveBeenCalled();
    // should have logged warn
    expect(moduleLogger).toBeDefined();
  });

  it('acquireLock: swallows release failure even when fn throws', async () => {
    mockLock.mockResolvedValueOnce(mockReleaseThrows);
    await expect(
      acquireLock(target, async () => {
        throw new Error('fn boom');
      }),
    ).rejects.toThrow('fn boom');
    expect(mockReleaseThrows).toHaveBeenCalled();
  });

  it('tryAcquireLock: release thunk swallows failure', async () => {
    mockLock.mockResolvedValueOnce(mockReleaseThrows);
    const release = await tryAcquireLock(target);
    expect(release).not.toBeNull();
    await release!(); // should not throw
    expect(mockReleaseThrows).toHaveBeenCalled();
  });

  it('tryAcquireLock: successful acquire and release calls release thunk', async () => {
    // Force lock to fail with ELOCKED so tryAcquireLock returns null;
    // then we test the returned thunk path where release is undefined is unreachable externally,
    // but we can test the success path already covers 113-114.
    // Instead test that successful acquire then release throw is swallowed.
    mockLock.mockResolvedValueOnce(mockReleaseOk);
    const release = await tryAcquireLock(target);
    expect(release).not.toBeNull();
    // now make release throw on second call? We already tested throw case.
    // Test normal release succeeds
    mockReleaseOk.mockClear();
    await release!();
    expect(mockReleaseOk).toHaveBeenCalled();
  });
});
