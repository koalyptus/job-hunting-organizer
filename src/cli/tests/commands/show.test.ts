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
      await writeFile(
        join(campaignDir, 'applied', slug, 'meta.md'),
        '---\nslug: ' +
          slug +
          '\ntitle: Software Engineer\ncompany: Test Corp\nstatus: applied\nappliedOn: 2026-06-03\n---\n',
      );

      const { stdout, exitCode } = await runCommand(showCommand, ['show', slug]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain(slug);
      expect(stdout).toContain('Software Engineer');
      expect(stdout).toContain('Test Corp');
      expect(stdout).toContain('applied');
      expect(stdout).toContain('File ownership');
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
      await writeFile(
        join(campaignDir, 'applied', slug, 'meta.md'),
        '---\nslug: ' +
          slug +
          '\ntitle: SE\ncompany: C\nstatus: applied\nappliedOn: 2026-06-03\n---\n',
      );

      const { stdout, exitCode } = await runCommand(showCommand, ['show', slug]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('meta.md');
      expect(stdout).toContain('jd.md');
      expect(stdout).toContain('cover-letter.md');
      expect(stdout).toContain('qa.md');
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
      await writeFile(
        join(campaignDir, 'applied', slug, 'meta.md'),
        '---\nslug: ' +
          slug +
          '\ntitle: SE\ncompany: C\nstatus: applied\nappliedOn: 2026-06-03\n---\n',
      );

      const { stdout, exitCode } = await runCommand(showCommand, ['show', slug]);
      expect(exitCode).toBe(0);
      expect(stdout).not.toContain('Location:');
      expect(stdout).not.toContain('Site:');
      expect(stdout).not.toContain('Salary:');
      expect(stdout).not.toContain('Tags:');
      expect(stdout).not.toContain('Target role:');
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
});
