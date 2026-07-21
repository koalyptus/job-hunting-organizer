import { describe, it, expect, vi, beforeEach } from 'vitest';
import { atomicWrite } from '../fs.js';
import { writeToolhash } from '../toolhash.js';
import { resolveCampaignRoot, resolveProfilePath } from '../paths.js';
import { ProfileWriteError, writeProfile } from './profile-writer.js';

vi.mock('../fs.js', () => ({
  atomicWrite: vi.fn(),
}));

vi.mock('../toolhash.js', () => ({
  computeHash: vi.fn((s: string) => `hash-${s}`),
  writeToolhash: vi.fn(),
}));

vi.mock('../paths.js', () => ({
  resolveCampaignRoot: vi.fn((name: string) => `/campaigns/${name}`),
  resolveProfilePath: vi.fn((root: string) => `${root}/profile.md`),
}));

vi.mock('../logger/logger.js', () => ({
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

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
