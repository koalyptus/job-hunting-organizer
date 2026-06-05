import { describe, expect, it } from 'vitest';
import {
  clearPackageCache,
  getPackageJson,
  getPackageRoot,
  getPackageVersion,
} from '../package.js';

describe('getPackageRoot', () => {
  it('returns an absolute path', () => {
    const root = getPackageRoot();
    expect(root.startsWith('/') || /^[A-Za-z]:[\\\\/]/.test(root)).toBe(true);
  });

  it('points to a directory containing package.json', () => {
    const root = getPackageRoot();
    expect(root.endsWith('job-hunting-organizer')).toBe(true);
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
