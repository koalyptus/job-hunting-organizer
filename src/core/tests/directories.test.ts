import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDirectories } from '../directories.js';

describe('createDirectories', () => {
  let testDir: string;
  let campaignRoot: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'jho-dirs-test-'));
    campaignRoot = join(testDir, 'campaigns', 'test');
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('creates campaign root directory', async () => {
    await createDirectories(campaignRoot);
    await stat(campaignRoot);
  });

  it('creates knowledge-base/github directory', async () => {
    await createDirectories(campaignRoot);
    await stat(join(campaignRoot, 'knowledge-base', 'github'));
  });

  it('returns kbDir path', async () => {
    const result = await createDirectories(campaignRoot);
    expect(result.kbDir).toBe(join(campaignRoot, 'knowledge-base'));
  });

  it('does not throw if directories already exist', async () => {
    await createDirectories(campaignRoot);
    await expect(createDirectories(campaignRoot)).resolves.not.toThrow();
  });
});
