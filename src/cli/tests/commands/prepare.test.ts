import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache } from '../../../core/config.js';
import { runCommand } from '../helpers.js';
import { prepareCommand } from '../../commands/prepare.js';
import * as prepareCore from '../../../core/prepare/index.js';
import { PrepError, PrepNotFoundError, PrepReadError } from '../../../core/prepare/index.js';
import * as extractModule from '../../../core/jobs/extract.js';
import type { ExtractedJd } from '../../../core/jobs/types.js';

vi.mock('../../../core/prepare/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof prepareCore>();
  return {
    ...actual,
    generatePrep: vi.fn(),
    generatePrepFromText: vi.fn(),
    readPrep: vi.fn(),
    appendTopic: vi.fn(),
  };
});

vi.mock('../../../core/jobs/extract.js', () => ({
  extractJdFromUrl: vi.fn(),
}));

vi.mock('../../../core/spinner.js', () => ({
  withSpinner: vi.fn((_msg: string, _success: string, fn: () => Promise<unknown>) => fn()),
}));

describe('prepare command', () => {
  let testHome: string;
  let originalJhoConfigHome: string | undefined;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-prepare-'));
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

  describe('prepare generate', () => {
    it('generates prep plan with explicit slug', async () => {
      vi.mocked(prepareCore.generatePrep).mockResolvedValue({
        content: 'Prep plan content',
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

      const { stdout, exitCode } = await runCommand(prepareCommand, ['prepare', slug]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Prep plan content');
      expect(prepareCore.generatePrep).toHaveBeenCalledWith(expect.objectContaining({ slug }));
    });

    it('generates prep plan with --days flag', async () => {
      vi.mocked(prepareCore.generatePrep).mockResolvedValue({
        content: 'Prep plan content',
        wordCount: 10,
        model: 'test-model',
        durationMs: 100,
      });

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { exitCode } = await runCommand(prepareCommand, ['prepare', slug, '--days', '14']);

      expect(exitCode).toBe(0);
      expect(prepareCore.generatePrep).toHaveBeenCalledWith(expect.objectContaining({ days: 14 }));
    });

    it('outputs JSON with --json flag', async () => {
      vi.mocked(prepareCore.generatePrep).mockResolvedValue({
        content: 'Prep plan content',
        wordCount: 10,
        model: 'test-model',
        durationMs: 100,
      });

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stdout, exitCode } = await runCommand(prepareCommand, ['prepare', slug, '--json']);

      expect(exitCode).toBe(0);
      // Extract JSON from output (JSON is first, followed by next steps text)
      const jsonEnd = stdout.indexOf('\n\n');
      const jsonStr = jsonEnd > 0 ? stdout.slice(0, jsonEnd) : stdout.trim();
      const parsed = JSON.parse(jsonStr);
      expect(parsed.content).toBe('Prep plan content');
      expect(parsed.slug).toBe(slug);
    });

    it('exits with error when slug is missing', async () => {
      const { stderr, exitCode } = await runCommand(prepareCommand, ['prepare']);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('missing <slug> argument');
    });

    it('exits with error when PrepNotFoundError is thrown', async () => {
      vi.mocked(prepareCore.generatePrep).mockRejectedValue(
        new PrepNotFoundError('Application not found'),
      );

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(prepareCommand, ['prepare', slug]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Application not found');
    });

    it('exits with error when PrepError is thrown', async () => {
      vi.mocked(prepareCore.generatePrep).mockRejectedValue(new PrepError('LLM generation failed'));

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(prepareCommand, ['prepare', slug]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('LLM generation failed');
    });
  });

  describe('prepare --add', () => {
    it('adds topic to existing prep', async () => {
      vi.mocked(prepareCore.appendTopic).mockResolvedValue();

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stdout, exitCode } = await runCommand(prepareCommand, [
        'prepare',
        slug,
        '--add',
        'React hooks',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Topic added: React hooks');
      expect(prepareCore.appendTopic).toHaveBeenCalledWith('default', slug, 'React hooks');
    });

    it('exits with error when slug is missing with --add', async () => {
      const { stderr, exitCode } = await runCommand(prepareCommand, [
        'prepare',
        '--add',
        'React hooks',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('slug is required when using --add');
    });
  });

  describe('prepare --text', () => {
    it('generates from pasted text', async () => {
      vi.mocked(prepareCore.generatePrepFromText).mockResolvedValue({
        content: 'Ad-hoc prep plan',
        wordCount: 5,
        model: 'test-model',
        durationMs: 100,
      });

      const { stdout, exitCode } = await runCommand(prepareCommand, [
        'prepare',
        '--text',
        'We need a senior React dev...',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Ad-hoc prep plan');
    });

    it('outputs JSON from --text with --json flag', async () => {
      vi.mocked(prepareCore.generatePrepFromText).mockResolvedValue({
        content: 'Ad-hoc prep plan',
        wordCount: 5,
        model: 'test-model',
        durationMs: 100,
      });

      const { stdout, exitCode } = await runCommand(prepareCommand, [
        'prepare',
        '--text',
        'We need a senior React dev...',
        '--json',
      ]);

      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.content).toBe('Ad-hoc prep plan');
      expect(parsed.slug).toBeNull();
    });

    it('passes --days and --steer flags to --text mode', async () => {
      vi.mocked(prepareCore.generatePrepFromText).mockResolvedValue({
        content: 'Ad-hoc prep plan',
        wordCount: 5,
        model: 'test-model',
        durationMs: 100,
      });

      const { exitCode } = await runCommand(prepareCommand, [
        'prepare',
        '--text',
        'We need a senior React dev...',
        '--days',
        '14',
        '--steer',
        'Focus on React hooks',
      ]);

      expect(exitCode).toBe(0);
      expect(prepareCore.generatePrepFromText).toHaveBeenCalledWith(
        expect.objectContaining({
          days: 14,
          steer: 'Focus on React hooks',
        }),
      );
    });
  });

  describe('prepare URL mode', () => {
    it('generates from URL', async () => {
      vi.mocked(extractModule.extractJdFromUrl).mockResolvedValue({
        title: 'Software Engineer',
        company: 'Test Corp',
        description: 'Job description from URL',
        rawText: 'Job description from URL',
      } satisfies ExtractedJd);
      vi.mocked(prepareCore.generatePrepFromText).mockResolvedValue({
        content: 'Prep plan from URL',
        wordCount: 5,
        model: 'test-model',
        durationMs: 100,
      });

      const { stdout, exitCode } = await runCommand(prepareCommand, [
        'prepare',
        'https://example.com/job/123',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Prep plan from URL');
      expect(extractModule.extractJdFromUrl).toHaveBeenCalled();
      expect(prepareCore.generatePrepFromText).toHaveBeenCalledWith(
        expect.objectContaining({
          jdText: 'Job description from URL',
        }),
      );
    });

    it('outputs JSON from URL with --json flag', async () => {
      vi.mocked(extractModule.extractJdFromUrl).mockResolvedValue({
        title: 'Software Engineer',
        company: 'Test Corp',
        description: 'Job description from URL',
        rawText: 'Job description from URL',
      } satisfies ExtractedJd);
      vi.mocked(prepareCore.generatePrepFromText).mockResolvedValue({
        content: 'Prep plan from URL',
        wordCount: 5,
        model: 'test-model',
        durationMs: 100,
      });

      const { stdout, exitCode } = await runCommand(prepareCommand, [
        'prepare',
        'https://example.com/job/123',
        '--json',
      ]);

      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.content).toBe('Prep plan from URL');
      expect(parsed.slug).toBeNull();
    });

    it('uses description fallback when rawText is missing', async () => {
      vi.mocked(extractModule.extractJdFromUrl).mockResolvedValue({
        title: 'Software Engineer',
        company: 'Test Corp',
        description: 'Fallback description',
      } satisfies ExtractedJd);
      vi.mocked(prepareCore.generatePrepFromText).mockResolvedValue({
        content: 'Prep plan from fallback',
        wordCount: 5,
        model: 'test-model',
        durationMs: 100,
      });

      const { exitCode } = await runCommand(prepareCommand, [
        'prepare',
        'https://example.com/job/123',
      ]);

      expect(exitCode).toBe(0);
      expect(prepareCore.generatePrepFromText).toHaveBeenCalledWith(
        expect.objectContaining({
          jdText: 'Fallback description',
        }),
      );
    });
  });

  describe('prepare show', () => {
    it('shows existing prep plan', async () => {
      vi.mocked(prepareCore.readPrep).mockResolvedValue(
        '<!-- jho:start:prepare -->\nPrep content\n<!-- jho:end:prepare -->',
      );

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stdout, exitCode } = await runCommand(prepareCommand, ['prepare', 'show', slug]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Prep content');
      expect(stdout).not.toContain('jho:start');
      expect(stdout).not.toContain('jho:end');
    });

    it('exits with error when prep not found', async () => {
      vi.mocked(prepareCore.readPrep).mockRejectedValue(new PrepReadError('No prep plan found'));

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(prepareCommand, ['prepare', 'show', slug]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('No prep plan found');
    });

    it('exits with error when slug is missing for show', async () => {
      const { stderr, exitCode } = await runCommand(prepareCommand, ['prepare', 'show']);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('missing <slug> argument');
    });
  });
});
