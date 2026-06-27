import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  createApplication,
  updateApplication,
  readApplication,
  listApplications,
  deleteApplication,
  getEntryFromSlug,
  appendNote,
  readIndex,
  ApplicationNotFoundError,
} from '../../applications/index.js';
import { todayIso } from '../../date.js';
import * as fsModule from '../../fs.js';
import { writeFrontmatter } from '../../frontmatter.js';

const mockRootLogger = vi.hoisted(() => ({
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
}));

vi.mock('../../logger/logger.js', () => ({
  getRootLogger: vi.fn(() => mockRootLogger),
  childLogger: vi.fn(() => mockRootLogger),
  moduleLogger: vi.fn(() => mockRootLogger),
}));

let workDir: string;
let appliedDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'jho-trk-'));
  appliedDir = join(workDir, 'applied');
  await mkdir(appliedDir, { recursive: true });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('createApplication', () => {
  it('creates a folder with meta.md and jd.md', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Software Engineer',
      company: 'Foo Inc',
      appliedOn: '2026-06-03',
    });

    expect(slug).toMatch(/^2026-Jun-03-software-engineer-foo-inc/);
    const folder = join(appliedDir, slug);
    expect(existsSync(folder)).toBe(true);
    expect(existsSync(join(folder, 'meta.md'))).toBe(true);
    expect(existsSync(join(folder, 'jd.md'))).toBe(true);
  });

  it('writes correct frontmatter in meta.md', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Senior Backend Engineer',
      company: 'Nuage Technology Group',
      url: 'https://au.seek.com/job/92448554',
      appliedOn: '2026-06-03',
      salary: '150k AUD',
      tags: ['typescript', 'node'],
      targetRole: 'senior-backend-engineer',
      location: 'Sydney',
      site: 'Seek',
    });

    const meta = await readFile(join(appliedDir, slug, 'meta.md'), 'utf8');
    expect(meta).toContain('slug:');
    expect(meta).toContain('status: applied');
    expect(meta).toContain('title: Senior Backend Engineer');
    expect(meta).toContain('company: Nuage Technology Group');
    expect(meta).toContain('salary: 150k AUD');
    expect(meta).toContain('targetRole: senior-backend-engineer');
    expect(meta).toContain('location: Sydney');
    expect(meta).toContain('site: Seek');
  });

  it('writes jd.md with region markers', async () => {
    const slug = await createApplication({ appliedDir, title: 'Engineer', company: 'Bar' });
    const jd = await readFile(join(appliedDir, slug, 'jd.md'), 'utf8');
    expect(jd).toContain('<!-- jho:start:fetched-jd -->');
    expect(jd).toContain('<!-- jho:end:fetched-jd -->');
  });

  it('writes description to jd.md fetched-jd region', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Engineer',
      company: 'Bar',
      description: 'We are looking for a senior engineer to build scalable systems.',
    });
    const jd = await readFile(join(appliedDir, slug, 'jd.md'), 'utf8');
    expect(jd).toContain('We are looking for a senior engineer to build scalable systems.');
  });

  it('writes empty fetched-jd region when description is not provided', async () => {
    const slug = await createApplication({ appliedDir, title: 'Engineer', company: 'Bar' });
    const jd = await readFile(join(appliedDir, slug, 'jd.md'), 'utf8');
    const match = jd.match(/<!-- jho:start:fetched-jd -->\n(.*?)\n<!-- jho:end:fetched-jd -->/s);
    expect(match?.[1]?.trim()).toBe('');
  });

  it('updates the index file', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Engineer',
      company: 'Baz',
      appliedOn: '2026-06-03',
    });
    const entries = await readIndex(appliedDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.slug).toBe(slug);
    expect(entries[0]!.title).toBe('Engineer');
  });

  it('appends -N suffix on slug collision', async () => {
    const slug1 = await createApplication({
      appliedDir,
      title: 'Engineer',
      company: 'Foo',
      appliedOn: '2026-06-03',
    });
    const slug2Result = await createApplication({
      appliedDir,
      title: 'Engineer',
      company: 'Foo',
      appliedOn: '2026-06-03',
    });
    expect(slug1).not.toBe(slug2Result);
    expect(slug2Result).toContain('-1');
  });

  it('uses today date when appliedOn is omitted', async () => {
    const slug = await createApplication({ appliedDir, title: 'Eng', company: 'X' });
    const today = todayIso();
    expect(slug).toContain(today.substring(0, 4));
  });

  it('defaults status to applied', async () => {
    const slug = await createApplication({ appliedDir, title: 'Eng', company: 'X' });
    const { frontmatter } = await readApplication(appliedDir, slug);
    expect(frontmatter.status).toBe('applied');
  });

  it('creates applied directory if it does not exist', async () => {
    const newDir = join(workDir, 'new-applied');
    const slug = await createApplication({
      appliedDir: newDir,
      title: 'Eng',
      company: 'X',
    });
    expect(existsSync(join(newDir, slug))).toBe(true);
  });
});

describe('updateApplication', () => {
  it('updates status', async () => {
    const slug = await createApplication({ appliedDir, title: 'Eng', company: 'X' });
    await updateApplication(appliedDir, slug, { status: 'interview' });
    const { frontmatter } = await readApplication(appliedDir, slug);
    expect(frontmatter.status).toBe('interview');
  });

  it('updates salary', async () => {
    const slug = await createApplication({ appliedDir, title: 'Eng', company: 'X' });
    await updateApplication(appliedDir, slug, { salary: '120k AUD' });
    const { frontmatter } = await readApplication(appliedDir, slug);
    expect(frontmatter.salary).toBe('120k AUD');
  });

  it('updates targetRole', async () => {
    const slug = await createApplication({ appliedDir, title: 'Eng', company: 'X' });
    await updateApplication(appliedDir, slug, { targetRole: 'staff-engineer' });
    const { frontmatter } = await readApplication(appliedDir, slug);
    expect(frontmatter.targetRole).toBe('staff-engineer');
  });

  it('updates link', async () => {
    const slug = await createApplication({ appliedDir, title: 'Eng', company: 'X' });
    await updateApplication(appliedDir, slug, { link: 'https://example.com/job/123' });
    const { frontmatter } = await readApplication(appliedDir, slug);
    expect(frontmatter.link).toBe('https://example.com/job/123');
  });

  it('adds tags without removing existing ones', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'X',
      tags: ['typescript'],
    });
    await updateApplication(appliedDir, slug, { tags: ['react'] });
    const { frontmatter } = await readApplication(appliedDir, slug);
    expect(frontmatter.tags).toContain('typescript');
    expect(frontmatter.tags).toContain('react');
  });

  it('preserves body text', async () => {
    const slug = await createApplication({ appliedDir, title: 'Eng', company: 'X' });
    const metaPath = join(appliedDir, slug, 'meta.md');
    const { frontmatter } = await readApplication(appliedDir, slug);
    await writeFrontmatter(
      metaPath,
      frontmatter as unknown as Record<string, unknown>,
      '# My Notes\n\nSome text.',
    );

    await updateApplication(appliedDir, slug, { status: 'offer' });
    const { body: newBody } = await readApplication(appliedDir, slug);
    expect(newBody).toContain('My Notes');
    expect(newBody).toContain('Some text.');
  });

  it('updates the index entry', async () => {
    const slug = await createApplication({ appliedDir, title: 'Eng', company: 'X' });
    await updateApplication(appliedDir, slug, { status: 'rejected' });
    const entry = await getEntryFromSlug(appliedDir, slug);
    expect(entry).not.toBeNull();
    expect(entry!.status).toBe('rejected');
  });

  it('throws when application does not exist', async () => {
    await expect(
      updateApplication(appliedDir, 'nonexistent', { status: 'interview' }),
    ).rejects.toThrow(ApplicationNotFoundError);
  });

  it('logs warning when validation fails and skips index update', async () => {
    const slug = await createApplication({ appliedDir, title: 'Eng', company: 'X' });
    const metaPath = join(appliedDir, slug, 'meta.md');

    // Manually write invalid status
    const raw = await readFile(metaPath, 'utf8');
    const corrupted = raw.replace('status: applied', 'status: invalid-status');
    await writeFile(metaPath, corrupted, 'utf8');

    // Update with valid patch — merged result still has invalid status
    await updateApplication(appliedDir, slug, { salary: '100k' });

    // Verify warning was logged
    expect(mockRootLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ slug }),
      'meta.md validation failed, index not updated',
    );

    // Verify index was NOT updated (entry should be stale or missing)
    const entry = await getEntryFromSlug(appliedDir, slug);
    // Entry may be null (if index wasn't updated) or have the old status
    if (entry !== null) {
      expect(entry.status).not.toBe('invalid-status');
    }
  });
});

describe('readApplication', () => {
  it('reads a valid application', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Engineer',
      company: 'Foo',
      appliedOn: '2026-06-03',
    });
    const { frontmatter, body } = await readApplication(appliedDir, slug);
    expect(frontmatter.slug).toBe(slug);
    expect(frontmatter.title).toBe('Engineer');
    expect(frontmatter.status).toBe('applied');
    expect(typeof body).toBe('string');
  });

  it('throws when application does not exist', async () => {
    await expect(readApplication(appliedDir, 'nonexistent')).rejects.toThrow(
      ApplicationNotFoundError,
    );
  });
});

describe('listApplications', () => {
  it('lists all applications', async () => {
    await createApplication({ appliedDir, title: 'Eng1', company: 'A' });
    await createApplication({ appliedDir, title: 'Eng2', company: 'B' });
    const entries = await listApplications(appliedDir);
    expect(entries).toHaveLength(2);
  });

  it('filters by status', async () => {
    const slug1 = await createApplication({ appliedDir, title: 'Eng1', company: 'A' });
    await createApplication({ appliedDir, title: 'Eng2', company: 'B' });
    await updateApplication(appliedDir, slug1, { status: 'interview' });

    const entries = await listApplications(appliedDir, { status: 'interview' });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.slug).toBe(slug1);
  });

  it('filters by targetRole', async () => {
    await createApplication({ appliedDir, title: 'Eng1', company: 'A', targetRole: 'backend' });
    await createApplication({ appliedDir, title: 'Eng2', company: 'B', targetRole: 'frontend' });

    const entries = await listApplications(appliedDir, { targetRole: 'backend' });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.targetRole).toBe('backend');
  });

  it('filters by tag', async () => {
    await createApplication({ appliedDir, title: 'Eng1', company: 'A', tags: ['typescript'] });
    await createApplication({ appliedDir, title: 'Eng2', company: 'B', tags: ['python'] });

    const entries = await listApplications(appliedDir, { tags: ['typescript'] });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.tags).toContain('typescript');
  });

  it('filters by multiple tags (AND)', async () => {
    await createApplication({
      appliedDir,
      title: 'Eng1',
      company: 'A',
      tags: ['typescript', 'react'],
    });
    await createApplication({
      appliedDir,
      title: 'Eng2',
      company: 'B',
      tags: ['typescript', 'node'],
    });

    const entries = await listApplications(appliedDir, { tags: ['typescript', 'react'] });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.title).toBe('Eng1');
  });

  it('returns empty array for non-existent directory', async () => {
    const entries = await listApplications(join(workDir, 'nonexistent'));
    expect(entries).toEqual([]);
  });
});

describe('deleteApplication', () => {
  it('returns true when folder is deleted', async () => {
    const slug = await createApplication({ appliedDir, title: 'Eng', company: 'X' });
    const result = await deleteApplication(appliedDir, slug);
    expect(result).toBe(true);
  });

  it('removes the folder and index entry', async () => {
    const slug = await createApplication({ appliedDir, title: 'Eng', company: 'X' });
    expect(existsSync(join(appliedDir, slug))).toBe(true);

    await deleteApplication(appliedDir, slug);
    expect(existsSync(join(appliedDir, slug))).toBe(false);

    const entry = await getEntryFromSlug(appliedDir, slug);
    expect(entry).toBeNull();
  });

  it('returns false for non-existent slug', async () => {
    const result = await deleteApplication(appliedDir, 'nonexistent');
    expect(result).toBe(false);
  });
});

describe('getEntryFromSlug', () => {
  it('returns entry for valid slug', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Engineer',
      company: 'Foo',
      targetRole: 'backend',
    });
    const entry = await getEntryFromSlug(appliedDir, slug);
    expect(entry).not.toBeNull();
    expect(entry!.slug).toBe(slug);
    expect(entry!.title).toBe('Engineer');
    expect(entry!.targetRole).toBe('backend');
  });

  it('returns null for non-existent slug', async () => {
    const entry = await getEntryFromSlug(appliedDir, 'nonexistent');
    expect(entry).toBeNull();
  });
});

describe('appendNote', () => {
  const USER_NOTES_COMMENT = '<!-- user notes below this line are preserved on re-track -->';

  it('throws if application folder does not exist', async () => {
    await expect(appendNote(appliedDir, 'nonexistent', 'note')).rejects.toThrow(
      ApplicationNotFoundError,
    );
  });

  it('creates jd.md with marker and note when jd.md does not exist', async () => {
    const slug = await createApplication({ appliedDir, title: 'Eng', company: 'X' });
    await appendNote(appliedDir, slug, 'my note');

    const jdPath = join(appliedDir, slug, 'jd.md');
    const content = await readFile(jdPath, 'utf8');

    expect(content).toContain(USER_NOTES_COMMENT);
    expect(content).toContain('my note');
    expect(content.endsWith('my note\n')).toBe(true);
  });

  it('appends note below marker when jd.md already has content', async () => {
    const slug = await createApplication({ appliedDir, title: 'Eng', company: 'X' });
    const jdPath = join(appliedDir, slug, 'jd.md');
    await writeFile(jdPath, '# Job Description\nSome content\n');

    await appendNote(appliedDir, slug, 'referred by Alice');

    const content = await readFile(jdPath, 'utf8');
    expect(content).toContain('# Job Description');
    expect(content).toContain(USER_NOTES_COMMENT);
    expect(content).toContain('referred by Alice');
    expect(content.indexOf(USER_NOTES_COMMENT)).toBeGreaterThan(
      content.indexOf('# Job Description'),
    );
  });

  it('does not duplicate marker when it already exists', async () => {
    const slug = await createApplication({ appliedDir, title: 'Eng', company: 'X' });
    const jdPath = join(appliedDir, slug, 'jd.md');
    await writeFile(jdPath, `# JD\n${USER_NOTES_COMMENT}\nexisting note\n`);

    await appendNote(appliedDir, slug, 'new note');

    const content = await readFile(jdPath, 'utf8');
    const markerCount = content.split(USER_NOTES_COMMENT).length - 1;
    expect(markerCount).toBe(1);
    expect(content).toContain('existing note');
    expect(content).toContain('new note');
  });

  it('appends multiple notes sequentially', async () => {
    const slug = await createApplication({ appliedDir, title: 'Eng', company: 'X' });

    await appendNote(appliedDir, slug, 'first note');
    await appendNote(appliedDir, slug, 'second note');

    const jdPath = join(appliedDir, slug, 'jd.md');
    const content = await readFile(jdPath, 'utf8');

    expect(content).toContain('first note');
    expect(content).toContain('second note');
    expect(content.indexOf('first note')).toBeLessThan(content.indexOf('second note'));
  });

  it('throws when atomicWrite fails', async () => {
    const slug = await createApplication({ appliedDir, title: 'Eng', company: 'X' });
    vi.spyOn(fsModule, 'atomicWrite').mockResolvedValue(false);

    await expect(appendNote(appliedDir, slug, 'note')).rejects.toThrow(
      `failed to write jd.md for ${slug}`,
    );
  });
});
