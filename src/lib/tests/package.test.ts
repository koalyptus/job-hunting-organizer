import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  clearPackageCache,
  findNearestPackageRoot,
  getPackageJson,
  getPackageRoot,
  getPackageVersion,
} from '../package.js';

describe('getPackageRoot', () => {
  it('returns an absolute path', () => {
    const root = getPackageRoot();
    expect(root.startsWith('/') || /^[A-Za-z]:[\\/]/.test(root)).toBe(true);
  });

  it('points to a directory containing package.json', () => {
    const root = getPackageRoot();
    expect(existsSync(join(root, 'package.json'))).toBe(true);
  });
});

describe('findNearestPackageRoot', () => {
  it('walks up from a deeply nested directory to find package.json', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'jho-pkgroot-'));
    try {
      // <tmp>/a/b/c/d — three levels deep, with package.json at <tmp>
      const deep = join(tmp, 'a', 'b', 'c', 'd');
      await mkdir(deep, { recursive: true });
      await writeFile(join(tmp, 'package.json'), '{}', 'utf8');

      expect(findNearestPackageRoot(deep)).toBe(tmp);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('returns startDir itself when package.json sits next to it', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'jho-pkgroot-'));
    try {
      await writeFile(join(tmp, 'package.json'), '{}', 'utf8');
      expect(findNearestPackageRoot(tmp)).toBe(tmp);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('throws when no package.json exists above the start directory', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'jho-pkgroot-'));
    try {
      // No package.json anywhere under tmp; the walk will eventually
      // hit the filesystem root and throw.
      expect(() => findNearestPackageRoot(tmp)).toThrow(/package\.json not found/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('uses the first package.json on the way up, not the topmost one', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'jho-pkgroot-'));
    try {
      // <tmp>/inner/package.json + <tmp>/package.json — should pick
      // <tmp>/inner, the closest one.
      const inner = join(tmp, 'inner');
      const deeper = join(inner, 'deeper');
      await mkdir(deeper, { recursive: true });
      await writeFile(join(inner, 'package.json'), '{}', 'utf8');
      await writeFile(join(tmp, 'package.json'), '{}', 'utf8');

      expect(findNearestPackageRoot(deeper)).toBe(inner);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('getPackageJson', () => {
  it('returns the real package.json fields', () => {
    const pkg = getPackageJson();
    expect(pkg.name).toBe('job-hunting-organizer');
    expect(typeof pkg.version).toBe('string');
    expect(pkg.version).toBe('0.1.0');
  });

  it('caches the result between calls', () => {
    const a = getPackageJson();
    const b = getPackageJson();
    expect(a).toBe(b);
  });
});

describe('getPackageVersion', () => {
  it('returns the version string from package.json', () => {
    expect(getPackageVersion()).toBe('0.1.0');
  });

  it('falls back to 0.0.0 when version is missing', async () => {
    const { join } = await import('node:path');
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');

    const root = await mkdtemp(join(tmpdir(), 'jho-pkg-'));
    const pkgPath = join(root, 'package.json');
    await writeFile(pkgPath, JSON.stringify({ name: 'test' }));
    clearPackageCache();

    const orig = await import('../../lib/package.js');
    const _getPkgRoot = orig.getPackageRoot;
    // Override cache by manipulating module internals isn't exposed;
    // instead we read directly via getPackageJson after clearing cache and chdir
    process.chdir(root);
    clearPackageCache();
    // Re-import to pick up new root via internal cache reset
    const pkg = (await import('../../lib/package.js')).getPackageJson();
    expect((pkg as Record<string, unknown>).name).toBe('test');
    expect((pkg as Record<string, unknown>).version).toBeUndefined();

    const version = (await import('../../lib/package.js')).getPackageVersion();
    expect(version).toBe('0.0.0');

    process.chdir(join(root, '..'));
    await rm(root, { recursive: true, force: true });
    clearPackageCache();
  });
});

describe('clearPackageCache', () => {
  it('forces the next call to re-read from disk', () => {
    const before = getPackageJson();
    clearPackageCache();
    const after = getPackageJson();
    expect(after).not.toBe(before);
    expect(after).toEqual(before);
  });
});
