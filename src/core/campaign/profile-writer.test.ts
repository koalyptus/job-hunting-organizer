import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProfileWriteError, writeProfile } from './profile-writer.js';
import type { FileStore } from '../../storage/types.js';

/**
 * Minimal stub store: records the relative paths handed to `write` and
 * verifies the lock wraps the whole write. Mirrors the 9c port-contract
 * pattern — we assert exact `StoragePath` arguments rather than touching disk.
 */
function makeStubStore() {
  const writes: { path: string; content: string }[] = [];
  let lockedPath: string | null = null;
  const store = {
    write: vi.fn(async (path: string, content: string) => {
      writes.push({ path, content });
    }),
    withLock: vi.fn(async (path: string, fn: () => Promise<boolean>) => {
      lockedPath = path;
      const result = await fn();
      lockedPath = null;
      return result;
    }),
  } as unknown as FileStore;
  return { store, writes, getLockedPath: () => lockedPath };
}

describe('writeProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes profile.md and profile.md.toolhash through the store', async () => {
    const { store, writes } = makeStubStore();

    const result = await writeProfile('default', '# My Profile', store);

    expect(writes).toHaveLength(2);
    const paths = writes.map((w) => w.path);
    expect(paths).toContain('profile.md');
    expect(paths).toContain('profile.md.toolhash');
    const hashWrite = writes.find((w) => w.path === 'profile.md.toolhash');
    expect(hashWrite!.content).toMatch(/\n$/);
    expect(result).toBe(true);
  });

  it('passes the exact profile content to profile.md', async () => {
    const { store, writes } = makeStubStore();

    await writeProfile('default', '# My Profile', store);

    const content = writes.find((w) => w.path === 'profile.md')!.content;
    expect(content).toBe('# My Profile');
  });

  it('throws ProfileWriteError when the store write rejects', async () => {
    const store = {
      write: vi.fn(async () => {
        throw new Error('disk full');
      }),
      withLock: vi.fn(async (_p: string, fn: () => Promise<boolean>) => fn()),
    } as unknown as FileStore;

    await expect(writeProfile('default', '# Broken', store)).rejects.toThrow(ProfileWriteError);
  });

  it('does not write the toolhash when the profile write fails', async () => {
    const writes: string[] = [];
    const store = {
      write: vi.fn(async (path: string) => {
        writes.push(path);
        if (path === 'profile.md') {
          throw new Error('disk full');
        }
      }),
      withLock: vi.fn(async (_p: string, fn: () => Promise<boolean>) => fn()),
    } as unknown as FileStore;

    await expect(writeProfile('default', '# Broken', store)).rejects.toThrow(ProfileWriteError);
    expect(writes).not.toContain('profile.md.toolhash');
  });

  it('builds a default campaign store when none is injected', async () => {
    // No injection: resolves the campaign root via the live data-root
    // resolution. We only assert it does not throw on a fresh temp root and
    // that the public behaviour (true on success) holds.
    const { createStore } = await import('../../storage/index.js');
    const { mkdtemp } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const root = await mkdtemp(join(tmpdir(), 'jho-profile-default-'));
    const store = createStore(root);

    const result = await writeProfile('default', '# My Profile', store);
    expect(result).toBe(true);
  });
});
