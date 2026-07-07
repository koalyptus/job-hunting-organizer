import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readShowData, readShowFile, ShowError, SHOWABLE_FILES } from '../../applications/show.js';
import { writeFrontmatter } from '../../frontmatter.js';
import { replaceRegion } from '../../markers.js';

vi.mock('../../logger/logger.js', () => ({
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

let workDir: string;
let appliedDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'jho-show-'));
  appliedDir = join(workDir, 'applied');
  await mkdir(appliedDir, { recursive: true });
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function createApp(slug: string, extraFiles: string[] = []): Promise<void> {
  const folder = join(appliedDir, slug);
  await mkdir(folder, { recursive: true });

  await writeFrontmatter(
    join(folder, 'meta.md'),
    {
      slug,
      status: 'applied',
      appliedOn: '2026-06-03',
      title: 'Software Engineer',
      company: 'Test Corp',
      location: 'Remote',
      site: 'LinkedIn',
      link: 'https://linkedin.com/jobs/123',
      salary: '$100k',
      tags: ['typescript'],
      targetRole: 'senior-engineer',
    },
    'Some user notes about this application.',
  );

  for (const file of extraFiles) {
    const filePath = join(folder, file);
    if (file.endsWith('.md')) {
      await writeFile(filePath, `# ${file}\n\nSample content for ${file}.`);
    } else {
      await writeFile(filePath, `Sample content for ${file}.`);
    }
  }
}

describe('readShowData', () => {
  it('returns frontmatter and empty filesPresent for minimal app', async () => {
    await createApp('2026-Jun-03-se-test-corp');
    const result = await readShowData(appliedDir, '2026-Jun-03-se-test-corp');

    expect(result.frontmatter.slug).toBe('2026-Jun-03-se-test-corp');
    expect(result.frontmatter.title).toBe('Software Engineer');
    expect(result.filesPresent).toContain('meta.md');
    // No extra files were created, so only meta.md and jd.md
    // (jd.md is created by createApplication, but our helper writeFrontmatter doesn't)
  });

  it('detects which files are present', async () => {
    await createApp('2026-Jun-03-se-test-corp', ['cover-letter.md', 'qa.md', 'interviews.md']);
    const result = await readShowData(appliedDir, '2026-Jun-03-se-test-corp');

    expect(result.filesPresent).toContain('meta.md');
    expect(result.filesPresent).toContain('cover-letter.md');
    expect(result.filesPresent).toContain('qa.md');
    expect(result.filesPresent).toContain('interviews.md');
    expect(result.filesPresent).not.toContain('retro.md');
    expect(result.filesPresent).not.toContain('prepare.md');
    expect(result.filesPresent).not.toContain('notes.md');
  });

  it('throws ShowError for missing application', async () => {
    await expect(readShowData(appliedDir, 'nonexistent-slug')).rejects.toThrow(ShowError);
  });

  it('includes retro, prepare, and notes when present', async () => {
    await createApp('2026-Jun-03-se-test-corp', ['retro.md', 'prepare.md', 'notes.md']);
    const result = await readShowData(appliedDir, '2026-Jun-03-se-test-corp');

    expect(result.filesPresent).toContain('retro.md');
    expect(result.filesPresent).toContain('prepare.md');
    expect(result.filesPresent).toContain('notes.md');
  });
});

describe('readShowFile', () => {
  it('reads raw content from a file', async () => {
    await createApp('2026-Jun-03-se-test-corp', ['cover-letter.md']);
    const content = await readShowFile(appliedDir, '2026-Jun-03-se-test-corp', 'cover-letter.md');
    expect(content).toContain('Sample content');
  });

  it('strips jho markers from output', async () => {
    const slug = '2026-Jun-03-se-test-corp';
    const folder = join(appliedDir, slug);
    await mkdir(folder, { recursive: true });
    await writeFrontmatter(
      join(folder, 'meta.md'),
      {
        slug,
        status: 'applied',
        appliedOn: '2026-06-03',
        title: 'SE',
        company: 'C',
        location: '',
        site: '',
        link: '',
        salary: '',
        tags: [],
        targetRole: '',
      },
      '',
    );

    const jdContent = replaceRegion('', 'fetched-jd', 'We are looking for a software engineer...', {
      createIfMissing: true,
    });
    await writeFile(join(folder, 'jd.md'), jdContent);

    const content = await readShowFile(appliedDir, slug, 'jd.md');
    expect(content).toContain('software engineer');
    expect(content).not.toContain('jho:start');
    expect(content).not.toContain('jho:end');
  });

  it('throws ShowError for missing file', async () => {
    await createApp('2026-Jun-03-se-test-corp');
    await expect(
      readShowFile(appliedDir, '2026-Jun-03-se-test-corp', 'cover-letter.md'),
    ).rejects.toThrow(ShowError);
  });

  it('preserves user content below markers', async () => {
    const slug = '2026-Jun-03-se-test-corp';
    const folder = join(appliedDir, slug);
    await mkdir(folder, { recursive: true });
    await writeFrontmatter(
      join(folder, 'meta.md'),
      {
        slug,
        status: 'applied',
        appliedOn: '2026-06-03',
        title: 'SE',
        company: 'C',
        location: '',
        site: '',
        link: '',
        salary: '',
        tags: [],
        targetRole: '',
      },
      '',
    );

    const jdContent = replaceRegion('', 'fetched-jd', 'Job description text.', {
      createIfMissing: true,
    });
    await writeFile(join(folder, 'jd.md'), jdContent + '\n\nUser notes go here.\n');

    const content = await readShowFile(appliedDir, slug, 'jd.md');
    expect(content).toContain('Job description text.');
    expect(content).toContain('User notes go here.');
  });
});

describe('SHOWABLE_FILES', () => {
  it('has all expected entries', () => {
    const flags = SHOWABLE_FILES.map((f) => f.flag);
    expect(flags).toContain('jd');
    expect(flags).toContain('meta');
    expect(flags).toContain('cover-letter');
    expect(flags).toContain('qa');
    expect(flags).toContain('interviews');
  });

  it('each entry has flag, file, and label', () => {
    for (const entry of SHOWABLE_FILES) {
      expect(entry.flag).toBeTruthy();
      expect(entry.file).toBeTruthy();
      expect(entry.label).toBeTruthy();
    }
  });
});
