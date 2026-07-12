import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache } from '../../../core/config/config.js';
import { runCommand } from '../helpers.js';
import { answerCommand } from '../../commands/answer.js';
import * as applicationQa from '../../../core/applications/application-qa.js';
import * as stdinModule from '../../stdin.js';
import { AnswerError } from '../../../core/applications/application-qa.js';
import { SlugMissingError } from '../../slug.js';

vi.mock('../../../core/applications/application-qa.js', async (importOriginal) => {
  const actual = await importOriginal<typeof applicationQa>();
  return {
    ...actual,
    answerQuestion: vi.fn(),
  };
});

vi.mock('../../stdin.js', () => ({
  readStdin: vi.fn(),
}));

vi.mock('../../../core/spinner.js', () => ({
  withSpinner: vi.fn((_msg: string, _success: string, fn: () => Promise<unknown>) => fn()),
}));

describe('answer command', () => {
  let testHome: string;
  let originalJhoConfigHome: string | undefined;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-answer-'));
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

  describe('happy path', () => {
    it('generates answer with explicit slug and question', async () => {
      vi.mocked(applicationQa.answerQuestion).mockResolvedValue({
        answer: 'I am a software engineer with 5 years of experience.',
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

      const { stdout, exitCode } = await runCommand(answerCommand, [
        'answer',
        slug,
        'Tell me about yourself',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('I am a software engineer with 5 years of experience.');
      expect(stdout).toContain('Answer saved to:');
      expect(stdout).toContain('qa.md');
      expect(stdout).toContain('Next steps');
      expect(applicationQa.answerQuestion).toHaveBeenCalledWith({
        slug,
        campaign: 'default',
        question: 'Tell me about yourself',
        imagePath: undefined,
        noSave: false,
      });
    });

    it('generates answer with --no-save option', async () => {
      vi.mocked(applicationQa.answerQuestion).mockResolvedValue({
        answer: 'Test answer.',
        wordCount: 2,
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

      const { stdout, exitCode } = await runCommand(answerCommand, [
        'answer',
        slug,
        'Why our company?',
        '--no-save',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Test answer.');
      expect(stdout).not.toContain('Answer saved to:');
    });

    it('generates answer with --image option', async () => {
      vi.mocked(applicationQa.answerQuestion).mockResolvedValue({
        answer: 'This is a login form.',
        wordCount: 5,
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

      const { stdout, exitCode } = await runCommand(answerCommand, [
        'answer',
        slug,
        'What is this UI?',
        '--image',
        '/path/to/screenshot.png',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('This is a login form.');
      expect(applicationQa.answerQuestion).toHaveBeenCalledWith({
        slug,
        campaign: 'default',
        question: 'What is this UI?',
        imagePath: '/path/to/screenshot.png',
        noSave: false,
      });
    });

    it('reads question from --stdin', async () => {
      vi.mocked(stdinModule.readStdin).mockResolvedValue('Question from stdin');
      vi.mocked(applicationQa.answerQuestion).mockResolvedValue({
        answer: 'Answer from stdin.',
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

      const { stdout, exitCode } = await runCommand(answerCommand, ['answer', slug, '--stdin']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Answer from stdin.');
      expect(applicationQa.answerQuestion).toHaveBeenCalledWith(
        expect.objectContaining({ question: 'Question from stdin' }),
      );
    });
  });

  describe('error handling', () => {
    it('exits with error when no question provided', async () => {
      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(answerCommand, ['answer', slug]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('missing question argument');
    });

    it('exits with error when SlugMissingError is thrown', async () => {
      vi.mocked(applicationQa.answerQuestion).mockRejectedValue(new SlugMissingError());

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(answerCommand, ['answer', slug, 'Test?']);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('missing <slug> argument');
    });

    it('exits with error when AnswerError is thrown', async () => {
      vi.mocked(applicationQa.answerQuestion).mockRejectedValue(
        new AnswerError('Failed to read application'),
      );

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(answerCommand, ['answer', slug, 'Test?']);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Failed to read application');
    });
  });

  describe('show subcommand', () => {
    it('prints qa.md content when file exists', async () => {
      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      const appDir = join(campaignDir, 'applied', slug);
      await mkdir(appDir, { recursive: true });
      await writeFile(
        join(appDir, 'qa.md'),
        '# Q&A — Software Engineer @ Test Corp\n\n## Question\n\nAnswer here.',
      );

      const { stdout, exitCode } = await runCommand(answerCommand, ['answer', 'show', slug]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('# Q&A — Software Engineer @ Test Corp');
      expect(stdout).toContain('Answer here.');
    });

    it('strips markers from output', async () => {
      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      const appDir = join(campaignDir, 'applied', slug);
      await mkdir(appDir, { recursive: true });
      await writeFile(
        join(appDir, 'qa.md'),
        '# Q&A — Software Engineer @ Test Corp\n\n<!-- jho:start:answer -->\nAnswer here.\n<!-- jho:end:answer -->',
      );

      const { stdout, exitCode } = await runCommand(answerCommand, ['answer', 'show', slug]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Answer here.');
      expect(stdout).not.toContain('jho:start');
      expect(stdout).not.toContain('jho:end');
    });

    it('exits with code 1 when qa.md is missing', async () => {
      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(answerCommand, ['answer', 'show', slug]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('No Q&A entries found');
      expect(stderr).toContain('jho answer');
    });

    it('exits with code 1 when slug is missing', async () => {
      const { stderr, exitCode } = await runCommand(answerCommand, ['answer', 'show']);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('missing <slug> argument');
    });

    it('re-throws unexpected errors', async () => {
      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const spy = vi.spyOn(applicationQa, 'readQa').mockRejectedValue(new Error('Unexpected'));

      await expect(runCommand(answerCommand, ['answer', 'show', slug])).rejects.toThrow(
        'Unexpected',
      );

      spy.mockRestore();
    });
  });
});
