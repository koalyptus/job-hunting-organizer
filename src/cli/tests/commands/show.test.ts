import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache } from '../../../core/config.js';
import { runCommand } from '../helpers.js';
import { showCommand } from '../../commands/show.js';
import * as showCore from '../../../core/applications/show.js';

vi.mock('../../../core/applications/show.js', async (importOriginal) => {
  const actual = await importOriginal<typeof showCore>();
  return {
    ...actual,
    readShowData: vi.fn(),
    readShowFile: vi.fn(),
  };
});

describe('show command', () => {
  let testHome: string;
  let originalJhoConfigHome: string | undefined;
  let originalJhoData: string | undefined;
  const mockFrontmatter = {
    slug: '2026-Jun-03-se-test-corp',
    status: 'applied' as const,
    appliedOn: '2026-06-03',
    title: 'Software Engineer',
    company: 'Test Corp',
    location: 'Remote',
    site: 'LinkedIn',
    link: '',
    salary: '$100k',
    tags: ['typescript'],
    targetRole: 'senior-engineer',
  };

  beforeEach(async () => {
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-show-cli-'));
    process.env['JHO_CONFIG_HOME'] = join(testHome, '.jho');
    process.env['JHO_DATA'] = join(testHome, 'data');
    clearConfigCache();

    await mkdir(join(testHome, '.jho'), { recursive: true });
    await writeFile(
      join(testHome, '.jho', 'config.json'),
      JSON.stringify({
        version: 1,
        dataRoot: join(testHome, 'data'),
        llm: { baseUrl: 'http://localhost:11434/v1', apiKey: 'test-key', model: 'test-model' },
        github: { user: 'testuser', token: '', repos: [] },
        calendar: {
          defaultProvider: 'ics',
          outlook: { tenantId: '', clientId: '', clientSecret: '' },
        },
        logging: { level: 'silent', file: '', redactPaths: [] },
      }),
    );

    const campaignDir = join(testHome, 'data', 'campaigns', 'default');
    await mkdir(join(campaignDir, 'applied'), { recursive: true });
    await writeFile(
      join(campaignDir, 'config.json'),
      JSON.stringify({
        version: 1,
        profile: { path: '' },
        cv: { path: '' },
        linkedin: { url: '' },
        applied: { dir: '' },
        knowledgeBase: { dir: '' },
      }),
    );
  });

  afterEach(async () => {
    clearConfigCache();
    vi.restoreAllMocks();
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
    await rm(testHome, { recursive: true, force: true });
  });

  describe('summary view', () => {
    it('shows summary with all metadata fields', async () => {
      vi.mocked(showCore.readShowData).mockResolvedValue({
        frontmatter: mockFrontmatter,
        body: '',
        filesPresent: ['meta.md', 'jd.md'],
      });

      const slug = '2026-Jun-03-se-test-corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stdout, exitCode } = await runCommand(showCommand, ['show', slug]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain(slug);
      // Grid columns: label without colon prefix
      expect(stdout).toContain('Title');
      expect(stdout).toContain('Software Engineer');
      expect(stdout).toContain('Company');
      expect(stdout).toContain('Test Corp');
      expect(stdout).toContain('Status');
      expect(stdout).toContain('applied');
      expect(stdout).toContain('Remote');
      expect(stdout).toContain('LinkedIn');
      expect(stdout).toContain('$100k');
      expect(stdout).toContain('senior-engineer');
      // File table header
      expect(stdout).toContain('Available files');
      expect(stdout).toContain('File');
      expect(stdout).toContain('Created by');
      expect(stdout).toContain('Notes');
      // Table rows: file + command
      expect(stdout).toContain('jho track');
    });

    it('shows file presence indicators', async () => {
      vi.mocked(showCore.readShowData).mockResolvedValue({
        frontmatter: mockFrontmatter,
        body: '',
        filesPresent: ['meta.md', 'jd.md', 'cover-letter.md', 'qa.md'],
      });

      const slug = '2026-Jun-03-se-test-corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stdout, exitCode } = await runCommand(showCommand, ['show', slug]);
      expect(exitCode).toBe(0);
      // File names in the table
      expect(stdout).toContain('meta.md');
      expect(stdout).toContain('jd.md');
      expect(stdout).toContain('cover-letter.md');
      expect(stdout).toContain('qa.md');
      // Command names in the Created by column
      expect(stdout).toContain('jho track');
      expect(stdout).toContain('jho cover-letter');
      expect(stdout).toContain('jho answer');
    });

    it('strips empty fields from display', async () => {
      vi.mocked(showCore.readShowData).mockResolvedValue({
        frontmatter: {
          slug: '2026-Jun-03-se-test-corp',
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
        body: '',
        filesPresent: ['meta.md'],
      });

      const slug = '2026-Jun-03-se-test-corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stdout, exitCode } = await runCommand(showCommand, ['show', slug]);
      expect(exitCode).toBe(0);
      expect(stdout).not.toContain('Location');
      expect(stdout).not.toContain('Site');
      expect(stdout).not.toContain('Salary');
      expect(stdout).not.toContain('Tags');
      expect(stdout).not.toContain('Target role');
    });

    it('outputs JSON with --json flag', async () => {
      vi.mocked(showCore.readShowData).mockResolvedValue({
        frontmatter: mockFrontmatter,
        body: 'some body text',
        filesPresent: ['meta.md', 'jd.md', 'qa.md'],
      });

      const { stdout, exitCode } = await runCommand(showCommand, [
        'show',
        '2026-Jun-03-se-test-corp',
        '--json',
      ]);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.slug).toBe('2026-Jun-03-se-test-corp');
      expect(parsed.title).toBe('Software Engineer');
      expect(parsed.company).toBe('Test Corp');
      expect(parsed.status).toBe('applied');
      expect(parsed.files).toEqual(['meta.md', 'jd.md', 'qa.md']);
      expect(parsed.body).toBeUndefined();
    });
  });

  describe('slug resolution', () => {
    it('uses explicit slug', async () => {
      vi.mocked(showCore.readShowData).mockResolvedValue({
        frontmatter: mockFrontmatter,
        body: '',
        filesPresent: ['meta.md'],
      });

      const slug = '2026-Jun-03-se-test-corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stdout, exitCode } = await runCommand(showCommand, ['show', slug]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain(slug);
    });

    it('errors with hint when slug missing', async () => {
      // Don't set up campaign dirs — runCommand will fail slug resolution
      const { stderr, exitCode } = await runCommand(showCommand, ['show']);
      expect(exitCode).toBe(1);
      expect(stderr).toContain('missing <slug> argument');
      expect(stderr).toContain('pass a slug');
    });
  });

  describe('error handling', () => {
    it('exits with friendly error for missing app', async () => {
      vi.mocked(showCore.readShowData).mockRejectedValue(
        new showCore.ShowError('application not found: nonexistent'),
      );

      const { stderr, exitCode } = await runCommand(showCommand, ['show', 'nonexistent']);
      expect(exitCode).toBe(1);
      expect(stderr).toContain('application not found');
    });
  });

  describe('--jd flag', () => {
    const slug = '2026-Jun-03-se-test-corp';
    const jdContent = '# Job Description\n\nWe are looking for...';

    beforeEach(async () => {
      vi.mocked(showCore.readShowData).mockResolvedValue({
        frontmatter: mockFrontmatter,
        body: '',
        filesPresent: ['meta.md', 'jd.md'],
      });
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });
    });

    it('shows jd.md content after the summary', async () => {
      vi.mocked(showCore.readShowFile).mockResolvedValue(jdContent);

      const { stdout, exitCode } = await runCommand(showCommand, ['show', slug, '--jd']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain(slug);
      expect(stdout).toContain('job description');
      expect(stdout).toContain(jdContent);
    });

    it('shows error when jd.md does not exist', async () => {
      vi.mocked(showCore.readShowFile).mockRejectedValue(new showCore.ShowError('not found'));

      const { stdout, stderr, exitCode } = await runCommand(showCommand, ['show', slug, '--jd']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain(slug);
      expect(stderr).toContain('jd.md not found');
    });

    it('includes jd.md content in JSON output', async () => {
      vi.mocked(showCore.readShowFile).mockResolvedValue(jdContent);

      const { stdout, exitCode } = await runCommand(showCommand, ['show', slug, '--jd', '--json']);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.slug).toBe(slug);
      expect(parsed['jd.md']).toBe(jdContent);
    });

    it('omits jd.md from JSON when file is missing', async () => {
      vi.mocked(showCore.readShowFile).mockRejectedValue(new showCore.ShowError('not found'));

      const { stdout, exitCode } = await runCommand(showCommand, ['show', slug, '--jd', '--json']);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.slug).toBe(slug);
      expect(parsed['jd.md']).toBeUndefined();
    });
  });
});
