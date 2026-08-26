import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = (await importOriginal()) as typeof import('node:fs');
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
    existsSync: actual.existsSync,
  };
});

import { readFileSync } from 'node:fs';
import { clearPackageCache, getPackageJson } from '../package.js';

describe('package branch: getPackageJson catch', () => {
  afterEach(() => {
    vi.mocked(readFileSync).mockRestore?.();
    clearPackageCache();
  });

  it('returns empty object when readFileSync throws (simulates missing/stripped install)', () => {
    // Ensure cache is clear so next call re-reads
    clearPackageCache();
    // Make getPackageRoot succeed (it uses existsSync, not mocked to throw)
    // but make readFileSync throw — this hits the catch in getPackageJson (lines 69-70)
    vi.mocked(readFileSync).mockImplementationOnce(() => {
      throw new Error('EACCES');
    });
    const pkg = getPackageJson();
    expect(pkg).toEqual({});
  });

  it('returns empty object when JSON.parse throws', () => {
    clearPackageCache();
    vi.mocked(readFileSync).mockReturnValueOnce('not-json{{{');
    const pkg = getPackageJson();
    expect(pkg).toEqual({});
  });

  it('caches the empty result after catch', () => {
    clearPackageCache();
    vi.mocked(readFileSync).mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const first = getPackageJson();
    const second = getPackageJson();
    expect(first).toBe(second);
    expect(first).toEqual({});
    expect(vi.mocked(readFileSync)).toHaveBeenCalledTimes(1);
  });
});
