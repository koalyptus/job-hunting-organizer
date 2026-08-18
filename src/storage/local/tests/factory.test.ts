import { mkdtemp, rm, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { campaignStore, campaignStoreFromRoot, campaignsStore, createStore } from '../factory.js';

describe('storage factory — campaign accessors', () => {
  let dataRoot: string;

  beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'jho-factory-test-'));
  });

  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  describe('campaignStore', () => {
    it('roots the store at <dataRoot>/campaigns/<name>', async () => {
      const st = campaignStore('alpha', { dataRoot });
      await st.write('profile.md', '# Alpha');

      const onDisk = await readFile(join(dataRoot, 'campaigns', 'alpha', 'profile.md'), 'utf8');
      expect(onDisk).toBe('# Alpha');
    });

    it('creates the campaigns parent when missing', async () => {
      const st = campaignStore('fresh', { dataRoot });
      await st.write('x.txt', 'y');

      const onDisk = await readFile(join(dataRoot, 'campaigns', 'fresh', 'x.txt'), 'utf8');
      expect(onDisk).toBe('y');
    });

    it('builds an in-memory store when inMemory is true', async () => {
      const st = campaignStore('alpha', { inMemory: true });
      await st.write('profile.md', '# Alpha');

      expect(await st.read('profile.md')).toBe('# Alpha');
      // Nothing was written to disk under the data root.
      await expect(readFile(join(dataRoot, 'campaigns', 'alpha', 'profile.md'))).rejects.toThrow();
    });
  });

  describe('campaignStoreFromRoot', () => {
    it('roots the store at the given absolute directory', async () => {
      const root = join(dataRoot, 'explicit', 'campaign');
      await mkdir(root, { recursive: true });
      const st = campaignStoreFromRoot(root);

      await st.write('profile.md', '# Explicit');
      const onDisk = await readFile(join(root, 'profile.md'), 'utf8');
      expect(onDisk).toBe('# Explicit');
    });
  });

  describe('campaignsStore', () => {
    it('roots the store at <dataRoot>/campaigns (the parent, not a single campaign)', async () => {
      const st = campaignsStore(dataRoot);
      await st.write('alpha/profile.md', '# Alpha');
      await st.write('beta/profile.md', '# Beta');

      expect(await readFile(join(dataRoot, 'campaigns', 'alpha', 'profile.md'), 'utf8')).toBe(
        '# Alpha',
      );
      expect(await readFile(join(dataRoot, 'campaigns', 'beta', 'profile.md'), 'utf8')).toBe(
        '# Beta',
      );
    });

    it('exposes the campaign folder name as a root-relative StoragePath', async () => {
      const st = campaignsStore(dataRoot);
      await st.write('alpha/profile.md', '# Alpha');

      // rename operates within the store root using the campaign folder name.
      await st.rename('alpha', 'alpha-renamed');
      expect(
        await readFile(join(dataRoot, 'campaigns', 'alpha-renamed', 'profile.md'), 'utf8'),
      ).toBe('# Alpha');
    });
  });

  describe('createStore parity', () => {
    it('createStore(dataRoot) shares the resolved root with campaign accessors', async () => {
      const base = createStore({ dataRoot });
      await base.write('campaigns/gamma/profile.md', '# Gamma');

      const st = campaignStore('gamma', { dataRoot });
      expect(await st.read('profile.md')).toBe('# Gamma');
    });
  });
});
