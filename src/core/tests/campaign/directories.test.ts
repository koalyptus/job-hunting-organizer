import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FileStore } from '../../../storage/types.js';
import { createStore } from '../../../storage/index.js';
import { createDirectories } from '../../campaign/directories.js';

describe('createDirectories', () => {
  let testDir: string;
  let campaignRoot: string;
  let store: FileStore;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'jho-dirs-test-'));
    campaignRoot = join(testDir, 'campaigns', 'test');
    store = createStore(campaignRoot);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('creates campaign root directory', async () => {
    await createDirectories('test', store);
    await stat(campaignRoot);
  });

  it('creates knowledge-base/github directory', async () => {
    await createDirectories('test', store);
    await stat(join(campaignRoot, 'knowledge-base', 'github'));
  });

  it('returns kbDir path', async () => {
    const result = await createDirectories('test', store);
    expect(result.kbDir).toBe('knowledge-base');
  });

  it('does not throw if directories already exist', async () => {
    await createDirectories('test', store);
    await expect(createDirectories('test', store)).resolves.not.toThrow();
  });
});
