import { describe, expect, it } from 'vitest';
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
    expect(root.endsWith('job-hunting-organizer')).toBe(true);
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
