import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache } from '../../../core/config.js';
import { runCommand } from '../helpers.js';
import { coverLetterCommand } from '../../commands/cover-letter.js';
import * as coverLetterCore from '../../../core/applications/cover-letter.js';
import { CoverLetterError } from '../../../core/applications/cover-letter.js';

vi.mock('../../../core/applications/cover-letter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof coverLetterCore>();
  return {
    ...actual,
    generateCoverLetter: vi.fn(),
  };
});

vi.mock('../../../core/spinner.js', () => ({
  withSpinner: vi.fn((_msg: string, _success: string, fn: () => Promise<unknown>) => fn()),
}));

describe('cover-letter command', () => {
  let testHome: string;
  let originalJhoConfigHome: string | undefined;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-cover-letter-'));
    process.env['JHO_CONFIG_HOME'] = join(testHome, '.jho');
    process.env['JHO_DATA'] = join(testHome, 'data');
    clearConfigCache();

    // Set up global config
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

    // Create campaign structure
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

  describe('slug mode', () => {
    it('generates cover letter with explicit slug', async () => {
      vi.mocked(coverLetterCore.generateCoverLetter).mockResolvedValue({
        content: 'Dear Hiring Manager,\n\nI am excited to apply...',
        wordCount: 10,
        model: 'test-model',
        durationMs: 100,
      });

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });
      await writeFile(
        join(campaignDir, 'applied', slug, 'meta.md'),
        '---\nslug: ' +
          slug +
          '\ntitle: Software Engineer\ncompany: Test Corp\nstatus: applied\n---\n',
      );

      const { stdout, exitCode } = await runCommand(coverLetterCommand, ['cover-letter', slug]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Dear Hiring Manager');
      expect(coverLetterCore.generateCoverLetter).toHaveBeenCalledWith({
        slug,
        campaign: 'default',
        noSave: false,
      });
    });

    it('generates cover letter with --no-save option', async () => {
      vi.mocked(coverLetterCore.generateCoverLetter).mockResolvedValue({
        content: 'Cover letter content.',
        wordCount: 3,
        model: 'test-model',
        durationMs: 100,
      });

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });
      await writeFile(
        join(campaignDir, 'applied', slug, 'meta.md'),
        '---\nslug: ' +
          slug +
          '\ntitle: Software Engineer\ncompany: Test Corp\nstatus: applied\n---\n',
      );

      const { stdout, stderr, exitCode } = await runCommand(coverLetterCommand, [
        'cover-letter',
        slug,
        '--no-save',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Cover letter content.');
      expect(stderr).not.toContain('cover-letter.md written');
    });
  });

  describe('error handling', () => {
    it('exits with error when SlugMissingError is thrown', async () => {
      const { stderr, exitCode } = await runCommand(coverLetterCommand, ['cover-letter']);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('missing <slug> argument');
    });

    it('exits with error when CoverLetterError is thrown', async () => {
      vi.mocked(coverLetterCore.generateCoverLetter).mockRejectedValue(
        new CoverLetterError('LLM call failed'),
      );

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(coverLetterCommand, ['cover-letter', slug]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('LLM call failed');
    });
  });

  describe('show subcommand', () => {
    it('prints cover letter content when file exists', async () => {
      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      const appDir = join(campaignDir, 'applied', slug);
      await mkdir(appDir, { recursive: true });
      await writeFile(join(appDir, 'cover-letter.md'), 'Dear Hiring Manager,\n\nI am writing...');

      const { stdout, exitCode } = await runCommand(coverLetterCommand, [
        'cover-letter',
        'show',
        slug,
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Dear Hiring Manager');
    });

    it('strips markers from output', async () => {
      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      const appDir = join(campaignDir, 'applied', slug);
      await mkdir(appDir, { recursive: true });
      await writeFile(
        join(appDir, 'cover-letter.md'),
        '<!-- jho:start:cover-letter -->\nDear Hiring Manager.\n<!-- jho:end:cover-letter -->',
      );

      const { stdout, exitCode } = await runCommand(coverLetterCommand, [
        'cover-letter',
        'show',
        slug,
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Dear Hiring Manager.');
      expect(stdout).not.toContain('jho:start');
      expect(stdout).not.toContain('jho:end');
    });

    it('exits with code 1 when cover-letter.md is missing', async () => {
      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(coverLetterCommand, [
        'cover-letter',
        'show',
        slug,
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('No cover letter found');
      expect(stderr).toContain('jho cover-letter');
    });

    it('exits with code 1 when slug is missing', async () => {
      const { stderr, exitCode } = await runCommand(coverLetterCommand, ['cover-letter', 'show']);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('missing <slug> argument');
    });

    it('re-throws unexpected errors', async () => {
      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const spy = vi
        .spyOn(coverLetterCore, 'readCoverLetter')
        .mockRejectedValue(new Error('Unexpected'));

      await expect(runCommand(coverLetterCommand, ['cover-letter', 'show', slug])).rejects.toThrow(
        'Unexpected',
      );

      spy.mockRestore();
    });
  });
});
