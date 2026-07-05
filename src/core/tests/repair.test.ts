import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { repairApp, repairAll, RepairError } from '../repair/index.js';
import { computeHash, readToolhash, writeToolhash } from '../toolhash.js';

vi.mock('../logger/logger.js', () => ({
  getRootLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    })),
  })),
  moduleLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  })),
}));

function writeMetaMd(
  appDir: string,
  slug: string,
  title = 'Software Engineer',
  company = 'Foo Inc',
) {
  return writeFile(
    join(appDir, 'meta.md'),
    [
      '---',
      `slug: ${slug}`,
      'status: applied',
      'appliedOn: 2026-06-03',
      `title: ${title}`,
      `company: ${company}`,
      'location: Sydney',
      'site: Seek',
      'link: https://example.com/job/123',
      'salary: ""',
      'tags: []',
      '---',
      '',
      'User notes.',
    ].join('\n'),
  );
}

describe('repairApp', () => {
  let workDir: string;
  let appliedDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-repair-app-'));
    appliedDir = join(workDir, 'applied');
    await mkdir(appliedDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('returns no actions when no tool-managed files exist', async () => {
    const slug = '2026-Jun-03-SE-Foo';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    // No meta.md, jd.md, etc. — just an empty app folder

    const result = await repairApp(appliedDir, slug);
    expect(result.actions).toHaveLength(0);
    expect(result.isIndexRebuilt).toBe(false);
  });

  it('creates toolhash sidecars for existing files', async () => {
    const slug = '2026-Jun-03-SE-Bar';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);
    await writeFile(join(appDir, 'jd.md'), 'Job description content.');

    const result = await repairApp(appliedDir, slug);
    const toolhashActions = result.actions.filter((a) => a.action === 'toolhash_updated');
    expect(toolhashActions.length).toBeGreaterThanOrEqual(1);

    // Verify sidecar was written
    const hash = await readToolhash(join(appDir, 'jd.md'));
    expect(hash).toBe(computeHash('Job description content.'));
  });

  it('updates mismatched toolhash sidecars', async () => {
    const slug = '2026-Jun-03-SE-Baz';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);
    await writeFile(join(appDir, 'jd.md'), 'Current content.');

    // Write wrong sidecar
    await writeToolhash(join(appDir, 'jd.md'), computeHash('Old content.'));

    const result = await repairApp(appliedDir, slug);
    const toolhashActions = result.actions.filter((a) => a.action === 'toolhash_updated');
    expect(toolhashActions.length).toBeGreaterThanOrEqual(1);

    // Verify sidecar now matches
    const hash = await readToolhash(join(appDir, 'jd.md'));
    expect(hash).toBe(computeHash('Current content.'));
  });

  it('skips files without sidecars when updateToolhash is false', async () => {
    const slug = '2026-Jun-03-SE-Qux';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);
    await writeFile(join(appDir, 'jd.md'), 'Job description.');

    const result = await repairApp(appliedDir, slug, { updateToolhash: false });
    expect(result.actions).toHaveLength(0);
  });

  it('throws RepairError when application folder is missing', async () => {
    await expect(repairApp(appliedDir, 'nonexistent')).rejects.toThrow(RepairError);
  });

  it('includes slug in each action', async () => {
    const slug = '2026-Jun-03-SE-Slug';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);
    await writeFile(join(appDir, 'jd.md'), 'Content.');

    const result = await repairApp(appliedDir, slug);
    for (const action of result.actions) {
      expect(action.slug).toBe(slug);
    }
  });
});

describe('repairAll', () => {
  let workDir: string;
  let campaignRoot: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-repair-all-'));
    campaignRoot = join(workDir, 'campaign');
    const appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('returns no actions when applied dir is missing', async () => {
    const noApplied = join(workDir, 'empty');
    await mkdir(noApplied, { recursive: true });

    const result = await repairAll(noApplied);
    expect(result.actions).toHaveLength(0);
    expect(result.isIndexRebuilt).toBe(false);
  });

  it('rebuilds the index from folder listing', async () => {
    const appliedDir = join(campaignRoot, 'applied');
    const slug1 = '2026-Jun-03-SE-Foo';
    const slug2 = '2026-Jun-04-SE-Bar';

    const appDir1 = join(appliedDir, slug1);
    const appDir2 = join(appliedDir, slug2);
    await mkdir(appDir1, { recursive: true });
    await mkdir(appDir2, { recursive: true });
    await writeMetaMd(appDir1, slug1);
    await writeMetaMd(appDir2, slug2);

    const result = await repairAll(campaignRoot);
    expect(result.isIndexRebuilt).toBe(true);
    expect(result.actions.some((a) => a.action === 'index_rebuilt')).toBe(true);

    // Verify index was actually written
    const indexContent = await readFile(join(appliedDir, '.index.json'), 'utf8');
    const index = JSON.parse(indexContent);
    expect(index).toHaveLength(2);
  });

  it('repairs toolhash sidecars for all applications', async () => {
    const appliedDir = join(campaignRoot, 'applied');
    const slug = '2026-Jun-03-SE-Baz';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);
    await writeFile(join(appDir, 'jd.md'), 'Content.');

    const result = await repairAll(campaignRoot);
    const toolhashActions = result.actions.filter((a) => a.action === 'toolhash_updated');
    expect(toolhashActions.length).toBeGreaterThanOrEqual(1);

    // Verify sidecar
    const hash = await readToolhash(join(appDir, 'jd.md'));
    expect(hash).toBe(computeHash('Content.'));
  });

  it('rebuilds counters from folder names with collision suffixes', async () => {
    const appliedDir = join(campaignRoot, 'applied');

    // Create folders with collision suffixes
    const base = '2026-Jun-03-SE-Foo';
    const appDir1 = join(appliedDir, base);
    const appDir2 = join(appliedDir, `${base}-2`);
    await mkdir(appDir1, { recursive: true });
    await mkdir(appDir2, { recursive: true });
    await writeMetaMd(appDir1, base);
    await writeMetaMd(appDir2, base, 'SE', 'Foo');

    const result = await repairAll(campaignRoot);
    expect(result.actions.some((a) => a.action === 'counters_rebuilt')).toBe(true);
  });

  it('skips broken applications without crashing', async () => {
    const appliedDir = join(campaignRoot, 'applied');
    const slugGood = '2026-Jun-03-SE-Good';
    const slugBad = 'bad-folder';

    const appDirGood = join(appliedDir, slugGood);
    const appDirBad = join(appliedDir, slugBad);
    await mkdir(appDirGood, { recursive: true });
    await mkdir(appDirBad, { recursive: true });
    await writeMetaMd(appDirGood, slugGood);
    // slugBad has no meta.md — repairApp will throw

    const result = await repairAll(campaignRoot);
    expect(result.isIndexRebuilt).toBe(true);
    // Should still have index_rebuilt and toolhash actions for the good app
    expect(result.actions.some((a) => a.action === 'index_rebuilt')).toBe(true);
  });
});
