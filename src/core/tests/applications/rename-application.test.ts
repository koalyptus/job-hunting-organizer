import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  renameApplication,
  RenameApplicationError,
  InvalidSlugError,
  SelfRenameError,
} from '../../applications/rename.js';
import { createApplication, readApplication, readIndex } from '../../applications/index.js';
import { writeFrontmatter } from '../../frontmatter.js';
import type { Frontmatter } from '../../types.js';

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
  workDir = await mkdtemp(join(tmpdir(), 'jho-rename-app-'));
  appliedDir = join(workDir, 'applied');
  await mkdir(appliedDir, { recursive: true });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('renameApplication', () => {
  it('renames an application folder', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Software Engineer',
      company: 'Acme',
      appliedOn: '2026-06-03',
    });
    const newSlug = '2026-Jun-03-SE-acme';

    await renameApplication(appliedDir, slug, newSlug);

    expect(existsSync(join(appliedDir, newSlug))).toBe(true);
    expect(existsSync(join(appliedDir, slug))).toBe(false);
  });

  it('updates meta.md slug field', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Software Engineer',
      company: 'Acme',
      appliedOn: '2026-06-03',
    });
    const newSlug = '2026-Jun-03-SE-acme';

    await renameApplication(appliedDir, slug, newSlug);

    const { frontmatter } = await readApplication(appliedDir, newSlug);
    expect(frontmatter.slug).toBe(newSlug);
  });

  it('preserves other frontmatter fields', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Software Engineer',
      company: 'Acme',
      appliedOn: '2026-06-03',
      salary: '150k AUD',
      tags: ['typescript', 'react'],
      targetRole: 'backend',
      location: 'Sydney',
      site: 'Seek',
    });
    const newSlug = '2026-Jun-03-SE-acme';

    await renameApplication(appliedDir, slug, newSlug);

    const { frontmatter } = await readApplication(appliedDir, newSlug);
    expect(frontmatter.title).toBe('Software Engineer');
    expect(frontmatter.company).toBe('Acme');
    expect(frontmatter.salary).toBe('150k AUD');
    expect(frontmatter.tags).toEqual(['typescript', 'react']);
    expect(frontmatter.targetRole).toBe('backend');
    expect(frontmatter.location).toBe('Sydney');
    expect(frontmatter.site).toBe('Seek');
  });

  it('preserves body text in meta.md', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Engineer',
      company: 'X',
      appliedOn: '2026-06-03',
    });
    const metaPath = join(appliedDir, slug, 'meta.md');
    const { frontmatter } = await readApplication(appliedDir, slug);
    await writeFrontmatter(
      metaPath,
      frontmatter as unknown as Frontmatter,
      '# My Notes\n\nImportant details.',
    );

    const newSlug = '2026-Jun-03-ENG-x';
    await renameApplication(appliedDir, slug, newSlug);

    const { body } = await readApplication(appliedDir, newSlug);
    expect(body).toContain('My Notes');
    expect(body).toContain('Important details.');
  });

  it('rebuilds the index', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Engineer',
      company: 'X',
      appliedOn: '2026-06-03',
    });
    const newSlug = '2026-Jun-03-ENG-x';

    await renameApplication(appliedDir, slug, newSlug);

    const entries = await readIndex(appliedDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.slug).toBe(newSlug);
    expect(entries.find((e) => e.slug === slug)).toBeUndefined();
  });

  it('throws InvalidSlugError for invalid new slug', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Engineer',
      company: 'X',
      appliedOn: '2026-06-03',
    });

    await expect(renameApplication(appliedDir, slug, 'not-a-slug')).rejects.toThrow(
      InvalidSlugError,
    );
  });

  it('throws RenameApplicationError when source does not exist', async () => {
    await expect(
      renameApplication(appliedDir, '2026-Jun-03-ENG-x', '2026-Jun-03-SE-y'),
    ).rejects.toThrow(RenameApplicationError);
  });

  it('throws RenameApplicationError when appliedDir does not exist', async () => {
    const missingDir = join(workDir, 'does-not-exist');
    await expect(
      renameApplication(missingDir, '2026-Jun-03-ENG-x', '2026-Jun-03-SE-y'),
    ).rejects.toThrow(RenameApplicationError);
  });

  it('throws RenameApplicationError when destination already exists', async () => {
    const slug1 = await createApplication({
      appliedDir,
      title: 'Engineer 1',
      company: 'A',
      appliedOn: '2026-06-03',
    });
    const slug2 = await createApplication({
      appliedDir,
      title: 'Engineer 2',
      company: 'B',
      appliedOn: '2026-06-03',
    });

    await expect(renameApplication(appliedDir, slug1, slug2)).rejects.toThrow(
      RenameApplicationError,
    );
  });

  it('throws SelfRenameError when cwd is inside the application folder', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Engineer',
      company: 'X',
      appliedOn: '2026-06-03',
    });
    const appFolder = join(appliedDir, slug);
    const originalCwd = process.cwd();
    vi.spyOn(process, 'cwd').mockReturnValue(appFolder);

    try {
      await expect(renameApplication(appliedDir, slug, '2026-Jun-03-SE-x')).rejects.toThrow(
        SelfRenameError,
      );
    } finally {
      vi.spyOn(process, 'cwd').mockReturnValue(originalCwd);
    }
  });

  it('works when meta.md does not exist (skips frontmatter update)', async () => {
    const slug = '2026-Jun-03-ENG-x';
    await mkdir(join(appliedDir, slug), { recursive: true });
    await writeFile(join(appliedDir, slug, 'some-file.txt'), 'content');

    const newSlug = '2026-Jun-03-SE-x';
    await renameApplication(appliedDir, slug, newSlug);

    expect(existsSync(join(appliedDir, newSlug))).toBe(true);
    expect(existsSync(join(appliedDir, newSlug, 'some-file.txt'))).toBe(true);
    expect(existsSync(join(appliedDir, slug))).toBe(false);
  });
});
