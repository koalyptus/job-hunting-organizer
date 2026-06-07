import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import {
  DEFAULT_APPLIED_DIRNAME,
  DEFAULT_CAMPAIGNS_DIRNAME,
  DEFAULT_CONFIG_FILENAME,
  DEFAULT_CONFIG_HOMEDIR,
  DEFAULT_DATA_ROOT_DIRNAME,
  SLUG_PATTERN,
  ensureRoot,
  findCampaignFromCwd,
  findConfigPath,
  findSlugFromCwd,
  isUnder,
  isWindows,
  resolveAppliedDir,
  resolveCampaignRoot,
  resolveConfigHome,
  resolveConfigPath,
  resolveDataRoot,
} from '../paths.js';

describe('isWindows', () => {
  it('returns a boolean consistent with process.platform', () => {
    expect(typeof isWindows()).toBe('boolean');
    expect(isWindows()).toBe(process.platform === 'win32');
  });
});

describe('resolveDataRoot', () => {
  const originalEnv = process.env['JHO_DATA'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['JHO_DATA'];
    } else {
      process.env['JHO_DATA'] = originalEnv;
    }
  });

  it('uses $JHO_DATA when set', () => {
    process.env['JHO_DATA'] = '/tmp/from-env';
    expect(resolveDataRoot()).toBe(resolve('/tmp/from-env'));
  });

  it('ignores empty $JHO_DATA', () => {
    process.env['JHO_DATA'] = '';
    const result = resolveDataRoot();
    expect(result.endsWith(DEFAULT_DATA_ROOT_DIRNAME)).toBe(true);
  });

  it('falls back to $HOME/job-hunting-organizer-data when no env', () => {
    delete process.env['JHO_DATA'];
    const result = resolveDataRoot();
    expect(result.endsWith(sep + DEFAULT_DATA_ROOT_DIRNAME)).toBe(true);
  });
});

describe('resolveConfigHome', () => {
  const originalEnv = process.env['JHO_CONFIG_HOME'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['JHO_CONFIG_HOME'];
    } else {
      process.env['JHO_CONFIG_HOME'] = originalEnv;
    }
  });

  it('uses $JHO_CONFIG_HOME when set', () => {
    process.env['JHO_CONFIG_HOME'] = '/tmp/from-env';
    expect(resolveConfigHome()).toBe(resolve('/tmp/from-env'));
  });

  it('ignores empty $JHO_CONFIG_HOME', () => {
    process.env['JHO_CONFIG_HOME'] = '';
    const result = resolveConfigHome();
    expect(result.endsWith(DEFAULT_CONFIG_HOMEDIR)).toBe(true);
  });

  it('falls back to $HOME/.job-hunting-organizer when no env', () => {
    delete process.env['JHO_CONFIG_HOME'];
    const result = resolveConfigHome();
    expect(result.endsWith(sep + DEFAULT_CONFIG_HOMEDIR)).toBe(true);
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

describe('findConfigPath', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-find-config-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('returns the config path when the file exists', async () => {
    const configPath = join(workDir, DEFAULT_CONFIG_FILENAME);
    await writeFile(configPath, '{}', 'utf8');
    expect(await findConfigPath(workDir)).toBe(configPath);
  });

  it('returns null when the file is missing', async () => {
    expect(await findConfigPath(workDir)).toBeNull();
  });
});

describe('ensureRoot', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-ensure-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('creates the directory if it does not exist', async () => {
    const target = join(workDir, 'nested', 'campaign');
    expect(existsSync(target)).toBe(false);
    await ensureRoot(target);
    expect(existsSync(target)).toBe(true);
  });

  it('is a no-op when the directory already exists', async () => {
    const target = join(workDir, 'existing');
    await mkdir(target, { recursive: true });
    await ensureRoot(target);
    expect(existsSync(target)).toBe(true);
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
  let dataRoot: string;

  beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'jho-campaigns-'));
    await mkdir(join(dataRoot, DEFAULT_CAMPAIGNS_DIRNAME, 'freelance'), { recursive: true });
    await mkdir(join(dataRoot, DEFAULT_CAMPAIGNS_DIRNAME, 'ft-jobs'), { recursive: true });
  });

  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it('returns null when cwd is outside the campaigns dir', () => {
    expect(findCampaignFromCwd(tmpdir(), dataRoot)).toBeNull();
  });

  it('returns the campaign name when cwd is the campaign folder', () => {
    const cwd = join(dataRoot, DEFAULT_CAMPAIGNS_DIRNAME, 'freelance');
    expect(findCampaignFromCwd(cwd, dataRoot)).toBe('freelance');
  });

  it('returns the campaign name when cwd is a subfolder of the campaign', () => {
    const cwd = join(dataRoot, DEFAULT_CAMPAIGNS_DIRNAME, 'freelance', 'applied', 'notes');
    expect(findCampaignFromCwd(cwd, dataRoot)).toBe('freelance');
  });

  it('returns null when no campaigns/ folder exists under the data root', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'jho-empty-'));
    try {
      expect(findCampaignFromCwd(empty, empty)).toBeNull();
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});

describe('isUnder', () => {
  it('returns true for the same path', () => {
    expect(isUnder('/a/b', '/a/b')).toBe(true);
  });

  it('returns true for a direct child', () => {
    expect(isUnder('/a/b/c', '/a/b')).toBe(true);
  });

  it('returns true for a deep descendant', () => {
    expect(isUnder('/a/b/c/d/e/f', '/a/b')).toBe(true);
  });

  it('returns false for a sibling', () => {
    expect(isUnder('/a/c', '/a/b')).toBe(false);
  });

  it('returns false for a parent', () => {
    expect(isUnder('/a', '/a/b')).toBe(false);
  });

  it('returns false for a distant cousin', () => {
    expect(isUnder('/x/y', '/a/b')).toBe(false);
  });
});
