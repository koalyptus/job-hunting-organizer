import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import {
  DEFAULT_APPLIED_DIRNAME,
  DEFAULT_CAMPAIGNS_DIRNAME,
  DEFAULT_CONFIG_FILENAME,
  DEFAULT_ROOT_DIRNAME,
  SLUG_PATTERN,
  findCampaignFromCwd,
  findSlugFromCwd,
  isWindows,
  resolveAppliedDir,
  resolveCampaignRoot,
  resolveConfigPath,
  resolveGlobalRoot,
} from '../paths.js';

describe('isWindows', () => {
  it('returns a boolean consistent with process.platform', () => {
    expect(typeof isWindows()).toBe('boolean');
    expect(isWindows()).toBe(process.platform === 'win32');
  });
});

describe('resolveGlobalRoot', () => {
  const originalEnv = process.env['JHO_ROOT'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['JHO_ROOT'];
    } else {
      process.env['JHO_ROOT'] = originalEnv;
    }
  });

  it('uses $JHO_ROOT when set', () => {
    process.env['JHO_ROOT'] = '/tmp/from-env';
    expect(resolveGlobalRoot()).toBe(resolve('/tmp/from-env'));
  });

  it('ignores empty $JHO_ROOT', () => {
    process.env['JHO_ROOT'] = '';
    const result = resolveGlobalRoot();
    expect(result.endsWith(DEFAULT_ROOT_DIRNAME)).toBe(true);
  });

  it('falls back to $HOME/job-hunting-organizer when no env', () => {
    delete process.env['JHO_ROOT'];
    const result = resolveGlobalRoot();
    expect(result.endsWith(sep + DEFAULT_ROOT_DIRNAME)).toBe(true);
  });
});

describe('resolveCampaignRoot', () => {
  it('joins <global>/campaigns/<name>', () => {
    const result = resolveCampaignRoot('freelance');
    expect(result.endsWith(join(DEFAULT_CAMPAIGNS_DIRNAME, 'freelance'))).toBe(true);
  });

  it('defaults to the "default" campaign', () => {
    const result = resolveCampaignRoot();
    expect(result.endsWith(join(DEFAULT_CAMPAIGNS_DIRNAME, 'default'))).toBe(true);
  });
});

describe('resolveConfigPath / resolveAppliedDir', () => {
  it('joins config.json to the root', () => {
    expect(resolveConfigPath('/tmp/x')).toBe(resolve('/tmp/x', DEFAULT_CONFIG_FILENAME));
  });

  it("joins 'applied' to the root", () => {
    expect(resolveAppliedDir('/tmp/x')).toBe(resolve('/tmp/x', DEFAULT_APPLIED_DIRNAME));
  });
});

describe('SLUG_PATTERN', () => {
  it('matches canonical slugs', () => {
    expect(SLUG_PATTERN.test('2026-Jun-03-SE-Nuage-Technology-Group-92448554')).toBe(true);
    expect(SLUG_PATTERN.test('2026-Jan-15-SE-Foo-123')).toBe(true);
  });

  it('rejects malformed slugs', () => {
    expect(SLUG_PATTERN.test('2026-jun-03-...')).toBe(false);
    expect(SLUG_PATTERN.test('2026-Jun-3-...')).toBe(false);
    expect(SLUG_PATTERN.test('not-a-slug')).toBe(false);
    expect(SLUG_PATTERN.test('2026-Jun-03-')).toBe(false);
  });
});

describe('findSlugFromCwd', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-paths-'));
    await mkdir(join(workDir, 'applied'), { recursive: true });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('returns null when cwd is outside the applied dir', () => {
    expect(findSlugFromCwd(workDir, join(workDir, 'applied'))).toBeNull();
  });

  it('returns the slug when cwd is the slug folder itself', async () => {
    const slug = '2026-Jun-03-SE-Foo-12345';
    const slugDir = join(workDir, 'applied', slug);
    await mkdir(slugDir, { recursive: true });
    expect(findSlugFromCwd(slugDir, join(workDir, 'applied'))).toBe(slug);
  });

  it('returns the slug when cwd is a subfolder of the slug', async () => {
    const slug = '2026-Jun-03-SE-Foo-12345';
    const inner = join(workDir, 'applied', slug, 'notes');
    await mkdir(inner, { recursive: true });
    expect(findSlugFromCwd(inner, join(workDir, 'applied'))).toBe(slug);
  });

  it('returns null when no slug-pattern folder exists in the path', async () => {
    const inner = join(workDir, 'applied', 'loose-folder', 'sub');
    await mkdir(inner, { recursive: true });
    expect(findSlugFromCwd(inner, join(workDir, 'applied'))).toBeNull();
  });
});

describe('findCampaignFromCwd', () => {
  let globalRoot: string;

  beforeEach(async () => {
    globalRoot = await mkdtemp(join(tmpdir(), 'jho-campaigns-'));
    await mkdir(join(globalRoot, DEFAULT_CAMPAIGNS_DIRNAME, 'freelance'), { recursive: true });
    await mkdir(join(globalRoot, DEFAULT_CAMPAIGNS_DIRNAME, 'ft-jobs'), { recursive: true });
  });

  afterEach(async () => {
    await rm(globalRoot, { recursive: true, force: true });
  });

  it('returns null when cwd is outside the campaigns dir', () => {
    expect(findCampaignFromCwd(tmpdir(), globalRoot)).toBeNull();
  });

  it('returns the campaign name when cwd is the campaign folder', () => {
    const cwd = join(globalRoot, DEFAULT_CAMPAIGNS_DIRNAME, 'freelance');
    expect(findCampaignFromCwd(cwd, globalRoot)).toBe('freelance');
  });

  it('returns the campaign name when cwd is a subfolder of the campaign', () => {
    const cwd = join(globalRoot, DEFAULT_CAMPAIGNS_DIRNAME, 'freelance', 'applied', 'notes');
    expect(findCampaignFromCwd(cwd, globalRoot)).toBe('freelance');
  });

  it('returns null when no campaigns/ folder exists under the global root', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'jho-empty-'));
    try {
      expect(findCampaignFromCwd(empty, empty)).toBeNull();
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});
