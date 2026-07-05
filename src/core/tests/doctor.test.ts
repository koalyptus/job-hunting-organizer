import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { diagnoseCampaign, diagnoseApp, DoctorError } from '../doctor/index.js';
import * as toolhashModule from '../toolhash.js';
const { computeHash, writeToolhash } = toolhashModule;

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

describe('diagnoseCampaign', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-doctor-campaign-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('returns 0 issues for a clean campaign', async () => {
    const campaignRoot = join(workDir, 'campaign');
    const appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });
    await writeFile(join(campaignRoot, 'config.json'), '{}');

    const appDir = join(appliedDir, '2026-Jun-03-SE-Foo');
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, '2026-Jun-03-SE-Foo');

    const issues = await diagnoseCampaign(campaignRoot);
    expect(issues).toHaveLength(0);
  });

  it('returns error when campaign root is missing', async () => {
    const issues = await diagnoseCampaign(join(workDir, 'nonexistent'));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('error');
    expect(issues[0]!.check).toBe('campaign_root_missing');
    expect(issues[0]!.slug).toBeNull();
  });

  it('returns warn when applied dir is missing', async () => {
    const campaignRoot = join(workDir, 'empty-campaign');
    await mkdir(campaignRoot, { recursive: true });

    const issues = await diagnoseCampaign(campaignRoot);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('warn');
    expect(issues[0]!.check).toBe('applied_dir_missing');
  });

  it('returns warn when campaign config is missing', async () => {
    const campaignRoot = join(workDir, 'no-config');
    const appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });

    const issues = await diagnoseCampaign(campaignRoot);
    expect(issues.some((i) => i.check === 'campaign_config_missing')).toBe(true);
  });

  it('detects index stale (folder not in index)', async () => {
    const campaignRoot = join(workDir, 'stale-index');
    const appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });
    await writeFile(join(campaignRoot, 'config.json'), '{}');

    // Create a valid app folder but empty index
    const appDir = join(appliedDir, '2026-Jun-03-SE-Foo');
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, '2026-Jun-03-SE-Foo');
    await writeFile(join(appliedDir, '.index.json'), '[]');

    const issues = await diagnoseCampaign(campaignRoot);
    expect(issues.some((i) => i.check === 'index_stale')).toBe(true);
  });

  it('detects index orphan (index entry without folder)', async () => {
    const campaignRoot = join(workDir, 'orphan-index');
    const appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });
    await writeFile(join(campaignRoot, 'config.json'), '{}');

    // Create index with entry that has no folder
    const index = [
      {
        slug: '2026-Jun-03-SE-Ghost',
        status: 'applied',
        title: 'Ghost Engineer',
        company: 'Ghost Inc',
        site: 'Seek',
        location: 'Sydney',
        targetRole: '',
        appliedOn: '2026-06-03',
        tags: [],
      },
    ];
    await writeFile(join(appliedDir, '.index.json'), JSON.stringify(index));

    const issues = await diagnoseCampaign(campaignRoot);
    expect(issues.some((i) => i.check === 'index_orphan')).toBe(true);
  });
});

describe('diagnoseApp', () => {
  let workDir: string;
  let appliedDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-doctor-app-'));
    appliedDir = join(workDir, 'applied');
    await mkdir(appliedDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('returns 0 issues for a clean application', async () => {
    const slug = '2026-Jun-03-SE-Foo';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);

    const issues = await diagnoseApp(appliedDir, slug);
    expect(issues).toHaveLength(0);
  });

  it('returns error when application folder is missing', async () => {
    const issues = await diagnoseApp(appliedDir, 'nonexistent');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('error');
    expect(issues[0]!.check).toBe('app_folder_missing');
  });

  it('returns error when meta.md is missing', async () => {
    const slug = 'no-meta-app';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });

    const issues = await diagnoseApp(appliedDir, slug);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('error');
    expect(issues[0]!.check).toBe('meta_missing');
  });

  it('returns error when meta.md frontmatter is invalid', async () => {
    const slug = 'bad-meta-app';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, 'meta.md'),
      ['---', 'slug: wrong-slug', 'status: nope', '---', ''].join('\n'),
    );

    const issues = await diagnoseApp(appliedDir, slug);
    expect(issues.some((i) => i.check === 'meta_invalid' || i.check === 'meta_parse_error')).toBe(
      true,
    );
  });

  it('returns error when meta.md has invalid YAML', async () => {
    const slug = 'yaml-error-app';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, 'meta.md'), '---\n  bad: [yaml: {\n---\n');

    const issues = await diagnoseApp(appliedDir, slug);
    expect(issues.some((i) => i.check === 'meta_parse_error')).toBe(true);
  });

  it('returns warn when toolhash sidecar mismatches', async () => {
    const slug = '2026-Jun-03-SE-Bar';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);

    // Create a jd.md with content
    const jdContent = 'Original job description.';
    await writeFile(join(appDir, 'jd.md'), jdContent);

    // Write sidecar with a different hash
    const wrongHash = computeHash('Tampered content.');
    await writeToolhash(join(appDir, 'jd.md'), wrongHash);

    const issues = await diagnoseApp(appliedDir, slug);
    expect(issues.some((i) => i.check === 'toolhash_mismatch')).toBe(true);
  });

  it('returns 0 issues when toolhash sidecar matches', async () => {
    const slug = '2026-Jun-03-SE-Baz';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);

    // Create a jd.md with content
    const jdContent = 'Original job description.';
    await writeFile(join(appDir, 'jd.md'), jdContent);

    // Write sidecar with correct hash
    const correctHash = computeHash(jdContent);
    await writeToolhash(join(appDir, 'jd.md'), correctHash);

    const issues = await diagnoseApp(appliedDir, slug);
    const toolhashIssues = issues.filter((i) => i.category === 'toolhash');
    expect(toolhashIssues).toHaveLength(0);
  });

  it('skips toolhash check for files without sidecar', async () => {
    const slug = '2026-Jun-03-SE-Qux';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);
    await writeFile(join(appDir, 'jd.md'), 'Job description.');

    // No sidecar written — should be clean
    const issues = await diagnoseApp(appliedDir, slug);
    expect(issues).toHaveLength(0);
  });

  it('reports all tool-managed files with mismatches', async () => {
    const slug = '2026-Jun-03-SE-Multi';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);

    // Create files with wrong hashes
    for (const file of ['jd.md', 'cover-letter.md']) {
      await writeFile(join(appDir, file), `Content for ${file}.`);
      await writeToolhash(join(appDir, file), computeHash('Wrong content.'));
    }

    const issues = await diagnoseApp(appliedDir, slug);
    const toolhashIssues = issues.filter((i) => i.check === 'toolhash_mismatch');
    expect(toolhashIssues).toHaveLength(2);
  });

  it('reports toolhash_read_error when hash comparison throws', async () => {
    const slug = '2026-Jun-03-SE-ReadErr';
    const appDir = join(appliedDir, slug);
    await mkdir(appDir, { recursive: true });
    await writeMetaMd(appDir, slug);
    await writeFile(join(appDir, 'jd.md'), 'Some content.');
    await writeToolhash(join(appDir, 'jd.md'), computeHash('Some content.'));

    // Make computeHash throw to trigger the catch inside the toolhash loop
    vi.spyOn(toolhashModule, 'computeHash').mockImplementationOnce(() => {
      throw new Error('hash failure');
    });

    const issues = await diagnoseApp(appliedDir, slug);
    const readErrorIssues = issues.filter((i) => i.check === 'toolhash_read_error');
    expect(readErrorIssues).toHaveLength(1);
    expect(readErrorIssues[0]!.slug).toBe(slug);
    expect(readErrorIssues[0]!.remediation).toBe('Check file permissions.');
  });
});

describe('DoctorError', () => {
  it('has the correct name and message', () => {
    const error = new DoctorError('test error');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DoctorError');
    expect(error.message).toBe('test error');
  });
});
