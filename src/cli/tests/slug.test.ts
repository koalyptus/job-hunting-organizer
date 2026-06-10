import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { resolveSlug } from '../slug.js';

describe('resolveSlug', () => {
  let workDir: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-slug-'));
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.spyOn(process.stderr, 'write').mockImplementation((() => true) as never);
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns the explicit slug when provided', () => {
    const result = resolveSlug('2026-Jan-15-frontend-acme-12345', 'default');
    expect(result).toBe('2026-Jan-15-frontend-acme-12345');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('exits with error when no explicit slug and cwd is not in applied/', async () => {
    const campaignDir = join(workDir, 'campaigns', 'default');
    const appliedDir = join(campaignDir, 'applied');
    await mkdir(appliedDir, { recursive: true });

    // Mock process.cwd to return a directory outside applied/
    vi.spyOn(process, 'cwd').mockReturnValue(workDir);

    // resolveSlug needs campaign resolution to work, but since we're
    // testing the "no slug found" path, the cwd inference will return null
    resolveSlug(undefined, 'default');

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('does not call process.exit when explicit slug is given', () => {
    resolveSlug('my-slug', 'default');
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
