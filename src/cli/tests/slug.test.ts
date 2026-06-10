import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolveSlug, SlugMissingError } from '../slug.js';

describe('resolveSlug', () => {
  let workDir: string;
  let testHome: string;
  let originalJhoConfigHome: string | undefined;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-slug-'));
    testHome = await mkdtemp(join(tmpdir(), 'jho-slug-home-'));
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoData = process.env['JHO_DATA'];
    process.env['JHO_CONFIG_HOME'] = join(testHome, '.jho');
    process.env['JHO_DATA'] = join(testHome, 'data');
  });

  afterEach(async () => {
    if (originalJhoConfigHome === undefined) {
      delete process.env['JHO_CONFIG_HOME'];
    } else {
      process.env['JHO_CONFIG_HOME'] = originalJhoConfigHome;
    }
    if (originalJhoData === undefined) {
      delete process.env['JHO_DATA'];
    } else {
      process.env['JHO_DATA'] = originalJhoData;
    }
    vi.restoreAllMocks();
    await rm(workDir, { recursive: true, force: true });
    await rm(testHome, { recursive: true, force: true });
  });

  it('returns the explicit slug when provided', () => {
    const result = resolveSlug('2026-Jan-15-frontend-acme-12345', 'default');
    expect(result).toBe('2026-Jan-15-frontend-acme-12345');
  });

  it('throws SlugMissingError when no explicit slug and cwd is not in applied/', () => {
    vi.spyOn(process, 'cwd').mockReturnValue(workDir);
    expect(() => resolveSlug(undefined, 'default')).toThrow(SlugMissingError);
  });

  it('returns explicit slug without touching cwd', () => {
    const cwdSpy = vi.spyOn(process, 'cwd');
    resolveSlug('my-slug', 'default');
    expect(cwdSpy).not.toHaveBeenCalled();
  });
});
