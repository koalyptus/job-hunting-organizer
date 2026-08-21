import { describe, it, expect, vi, beforeEach } from 'vitest';
import { atomicWrite } from '../../lib/fs.js';
import { writeToolhash } from '../../lib/toolhash.js';
import { resolveCampaignRoot, resolveProfilePath } from '../../lib/paths.js';
import { ProfileWriteError, writeProfile } from './profile-writer.js';

vi.mock('../../lib/fs.js', () => ({
  atomicWrite: vi.fn(),
}));

vi.mock('../../lib/toolhash.js', () => ({
  computeHash: vi.fn((s: string) => `hash-${s}`),
  writeToolhash: vi.fn(),
}));

vi.mock('../../lib/paths.js', () => ({
  resolveCampaignRoot: vi.fn((name: string) => `/campaigns/${name}`),
  resolveProfilePath: vi.fn((root: string) => `${root}/profile.md`),
}));

vi.mock('../../lib/logger/logger.js', () => ({
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../lib/locks.js', async () => {
  const actual = await vi.importActual('../../lib/locks.js');
  return {
    ...actual,
    acquireLock: vi.fn((_: string, fn: () => unknown) => fn()),
  };
});

describe('writeProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes profile content atomically and returns true', async () => {
    vi.mocked(atomicWrite).mockResolvedValue(true);

    const result = await writeProfile('default', '# My Profile');

    expect(resolveCampaignRoot).toHaveBeenCalledWith('default');
    expect(resolveProfilePath).toHaveBeenCalledWith('/campaigns/default');
    expect(atomicWrite).toHaveBeenCalledWith('/campaigns/default/profile.md', '# My Profile');
    expect(writeToolhash).toHaveBeenCalledWith(
      '/campaigns/default/profile.md',
      'hash-# My Profile',
    );
    expect(result).toBe(true);
  });

  it('throws ProfileWriteError when atomicWrite fails', async () => {
    vi.mocked(atomicWrite).mockResolvedValue(false);

    await expect(writeProfile('default', '# Broken')).rejects.toThrow(ProfileWriteError);
    await expect(writeProfile('default', '# Broken')).rejects.toThrow(
      'failed to write profile to /campaigns/default/profile.md',
    );
    expect(writeToolhash).not.toHaveBeenCalled();
  });
});
