import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  clearPackageCache,
  findNearestPackageRoot,
  getPackageJson,
  getPackageRoot,
  getPackageVersion,
} from '../package.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Read the expected version directly from package.json so the test never breaks on a version bump. */
function expectedVersion(): string {
  const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf-8')) as {
    version: string;
  };
  return pkg.version;
}

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
    const tempDir = await mkdtemp(join(tmpdir(), 'jho-pkgroot-'));
    try {
      // <tempDir>/a/b/c/d — three levels deep, with package.json at <tempDir>
      const nestedDir = join(tempDir, 'a', 'b', 'c', 'd');
      await mkdir(nestedDir, { recursive: true });
      await writeFile(join(tempDir, 'package.json'), '{}', 'utf8');

      expect(findNearestPackageRoot(nestedDir)).toBe(tempDir);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('returns startDir itself when package.json sits next to it', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'jho-pkgroot-'));
    try {
      await writeFile(join(tempDir, 'package.json'), '{}', 'utf8');
      expect(findNearestPackageRoot(tempDir)).toBe(tempDir);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('throws when no package.json exists above the start directory', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'jho-pkgroot-'));
    try {
      // No package.json anywhere under tempDir; the walk will eventually
      // hit the filesystem root and throw.
      expect(() => findNearestPackageRoot(tempDir)).toThrow(/package\.json not found/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('uses the first package.json on the way up, not the topmost one', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'jho-pkgroot-'));
    try {
      // <tempDir>/innerDir/package.json + <tempDir>/package.json — should pick
      // <tempDir>/innerDir, the closest one.
      const innerDir = join(tempDir, 'inner');
      const deeperDir = join(innerDir, 'deeper');
      await mkdir(deeperDir, { recursive: true });
      await writeFile(join(innerDir, 'package.json'), '{}', 'utf8');
      await writeFile(join(tempDir, 'package.json'), '{}', 'utf8');

      expect(findNearestPackageRoot(deeperDir)).toBe(innerDir);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe('getPackageJson', () => {
  it('returns the real package.json fields', () => {
    const pkg = getPackageJson();
    expect(pkg.name).toBe('job-hunting-organizer');
    expect(typeof pkg.version).toBe('string');
    expect(pkg.version).toBe(expectedVersion());
  });

  it('caches the result between calls', () => {
    const a = getPackageJson();
    const b = getPackageJson();
    expect(a).toBe(b);
  });
});

describe('getPackageVersion', () => {
  it('returns the version string from package.json', () => {
    expect(getPackageVersion()).toBe(expectedVersion());
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
