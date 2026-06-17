import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readProfile, ProfileReadError } from '../profile.js';

describe('readProfile', () => {
  let testHome: string;

  beforeEach(async () => {
    testHome = await mkdtemp(join(tmpdir(), 'jho-profile-read-'));
  });

  afterEach(async () => {
    await rm(testHome, { recursive: true, force: true });
  });

  it('returns profile content', async () => {
    const campaignRoot = join(testHome, 'campaign');
    await mkdir(campaignRoot, { recursive: true });
    await writeFile(join(campaignRoot, 'profile.md'), '# My Profile\n\nBody here.');

    const content = await readProfile(campaignRoot);
    expect(content).toBe('# My Profile\n\nBody here.');
  });

  it('throws ProfileReadError when file does not exist', async () => {
    const campaignRoot = join(testHome, 'nonexistent');
    await mkdir(campaignRoot, { recursive: true });

    await expect(readProfile(campaignRoot)).rejects.toThrow(ProfileReadError);
  });

  it('throws ProfileReadError with helpful message', async () => {
    const campaignRoot = join(testHome, 'empty');
    await mkdir(campaignRoot, { recursive: true });

    await expect(readProfile(campaignRoot)).rejects.toThrow('jho init');
  });
});
