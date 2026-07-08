import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache } from '../../../core/config.js';
import { runCommand } from '../helpers.js';
import { retroCommand } from '../../commands/retro.js';
import * as retroCore from '../../../core/retro/index.js';
import { RetroError, RetroNotFoundError } from '../../../core/retro/index.js';

vi.mock('../../../core/retro/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof retroCore>();
  return {
    ...actual,
    startRetro: vi.fn(),
    appendRetro: vi.fn(),
    showRetro: vi.fn(),
    aggregateRetros: vi.fn(),
  };
});

vi.mock('../../../core/spinner.js', () => ({
  withSpinner: vi.fn((_msg: string, _success: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('@clack/prompts', () => ({
  text: vi.fn(async () => 'System design, SQL'),
  isCancel: vi.fn(() => false),
  log: { info: vi.fn() },
}));

describe('retro command', () => {
  let testHome: string;
  let originalJhoConfigHome: string | undefined;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-retro-'));
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

  describe('retro generate', () => {
    it('generates retro with --weak-topics', async () => {
      vi.mocked(retroCore.startRetro).mockResolvedValue({
        content: 'Learning plan content',
        wordCount: 5,
        model: 'test-model',
        durationMs: 100,
        index: 1,
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

      const { stdout, exitCode } = await runCommand(retroCommand, [
        'retro',
        slug,
        '--weak-topics',
        'System design, SQL',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Learning plan content');
      expect(retroCore.startRetro).toHaveBeenCalledWith(
        expect.objectContaining({
          slug,
          weakTopics: ['System design', 'SQL'],
        }),
      );
    });

    it('generates retro with --notes and --steer flags', async () => {
      vi.mocked(retroCore.startRetro).mockResolvedValue({
        content: 'Learning plan content',
        wordCount: 5,
        model: 'test-model',
        durationMs: 100,
        index: 1,
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

      const { exitCode } = await runCommand(retroCommand, [
        'retro',
        slug,
        '--weak-topics',
        'System design',
        '--notes',
        'Failed phone screen',
        '--steer',
        'Focus on concurrency',
      ]);

      expect(exitCode).toBe(0);
      expect(retroCore.startRetro).toHaveBeenCalledWith(
        expect.objectContaining({
          slug,
          weakTopics: ['System design'],
          notes: 'Failed phone screen',
          steer: 'Focus on concurrency',
        }),
      );
    });

    it('generates retro with --interview flag', async () => {
      vi.mocked(retroCore.startRetro).mockResolvedValue({
        content: 'Learning plan content',
        wordCount: 5,
        model: 'test-model',
        durationMs: 100,
        index: 1,
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

      const { exitCode } = await runCommand(retroCommand, [
        'retro',
        slug,
        '--weak-topics',
        'System design',
        '--interview',
        '2',
      ]);

      expect(exitCode).toBe(0);
      expect(retroCore.startRetro).toHaveBeenCalledWith(
        expect.objectContaining({
          slug,
          interviewId: 2,
        }),
      );
    });

    it('generates retro via interactive prompt', async () => {
      const { text } = await import('@clack/prompts');
      vi.mocked(text).mockResolvedValue('Dynamic programming, Graphs');

      vi.mocked(retroCore.startRetro).mockResolvedValue({
        content: 'Learning plan from prompt',
        wordCount: 5,
        model: 'test-model',
        durationMs: 100,
        index: 1,
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

      const { stdout, exitCode } = await runCommand(retroCommand, ['retro', slug]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Learning plan from prompt');
      expect(retroCore.startRetro).toHaveBeenCalledWith(
        expect.objectContaining({
          weakTopics: ['Dynamic programming', 'Graphs'],
        }),
      );
    });

    it('exits when user cancels interactive prompt', async () => {
      const { text, isCancel } = await import('@clack/prompts');
      vi.mocked(text).mockResolvedValue('User input');
      vi.mocked(isCancel).mockReturnValue(true);

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { exitCode } = await runCommand(retroCommand, ['retro', slug]);

      expect(exitCode).toBe(0);
    });

    it('exits with error when SlugMissingError is thrown', async () => {
      const { stderr, exitCode } = await runCommand(retroCommand, ['retro']);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('missing <slug> argument');
    });

    it('exits with error when RetroNotFoundError is thrown', async () => {
      vi.mocked(retroCore.startRetro).mockRejectedValue(
        new RetroNotFoundError('No retro file found'),
      );

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(retroCommand, [
        'retro',
        slug,
        '--weak-topics',
        'System design',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('No retro file found');
    });

    it('exits with error when RetroError is thrown', async () => {
      vi.mocked(retroCore.startRetro).mockRejectedValue(new RetroError('LLM generation failed'));

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(retroCommand, [
        'retro',
        slug,
        '--weak-topics',
        'System design',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('LLM generation failed');
    });
  });

  describe('retro show', () => {
    it('shows existing retro', async () => {
      vi.mocked(retroCore.showRetro).mockResolvedValue('Existing retro content');

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stdout, exitCode } = await runCommand(retroCommand, ['retro', 'show', slug]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Existing retro content');
    });

    it('exits with error when retro not found', async () => {
      vi.mocked(retroCore.showRetro).mockRejectedValue(new RetroNotFoundError('No retro found'));

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(retroCommand, ['retro', 'show', slug]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('No retro found');
    });

    it('exits with error when RetroError is thrown', async () => {
      vi.mocked(retroCore.showRetro).mockRejectedValue(new RetroError('Read failed'));

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(retroCommand, ['retro', 'show', slug]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Read failed');
    });
  });

  describe('retro append', () => {
    it('appends weak topics', async () => {
      vi.mocked(retroCore.appendRetro).mockResolvedValue({
        content: 'Updated learning plan',
        wordCount: 10,
        model: 'test-model',
        durationMs: 100,
        index: 1,
      });

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stdout, exitCode } = await runCommand(retroCommand, [
        'retro',
        'append',
        slug,
        '--weak-topics',
        'Behavioural',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Updated learning plan');
    });

    it('appends via interactive prompt', async () => {
      const { text } = await import('@clack/prompts');
      vi.mocked(text).mockResolvedValue('System design, Kubernetes');

      vi.mocked(retroCore.appendRetro).mockResolvedValue({
        content: 'Updated learning plan',
        wordCount: 10,
        model: 'test-model',
        durationMs: 100,
        index: 1,
      });

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stdout, exitCode } = await runCommand(retroCommand, ['retro', 'append', slug]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Updated learning plan');
    });

    it('exits when user cancels interactive prompt', async () => {
      const { text, isCancel } = await import('@clack/prompts');
      vi.mocked(text).mockResolvedValue('User input');
      vi.mocked(isCancel).mockReturnValue(true);

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { exitCode } = await runCommand(retroCommand, ['retro', 'append', slug]);

      expect(exitCode).toBe(0);
    });

    it('exits with error when SlugMissingError is thrown', async () => {
      const { stderr, exitCode } = await runCommand(retroCommand, ['retro', 'append']);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('missing <slug> argument');
    });

    it('exits with error when RetroNotFoundError is thrown', async () => {
      vi.mocked(retroCore.appendRetro).mockRejectedValue(
        new RetroNotFoundError('No retro to append to'),
      );

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(retroCommand, [
        'retro',
        'append',
        slug,
        '--weak-topics',
        'Behavioural',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('No retro to append to');
    });

    it('exits with error when RetroError is thrown', async () => {
      vi.mocked(retroCore.appendRetro).mockRejectedValue(new RetroError('Append failed'));

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(retroCommand, [
        'retro',
        'append',
        slug,
        '--weak-topics',
        'Behavioural',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Append failed');
    });
  });

  describe('retro aggregate', () => {
    it('shows aggregated topics', async () => {
      vi.mocked(retroCore.aggregateRetros).mockResolvedValue([
        { label: 'System design', count: 3, apps: ['app1', 'app2', 'app3'] },
      ]);

      const { stdout, exitCode } = await runCommand(retroCommand, ['retro', 'aggregate']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('System design');
      expect(stdout).toContain('3x');
    });

    it('shows message when no topics found', async () => {
      vi.mocked(retroCore.aggregateRetros).mockResolvedValue([]);

      const { stdout, exitCode } = await runCommand(retroCommand, ['retro', 'aggregate']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('No recurring weak topics');
    });

    it('passes --role and --include-abandoned flags', async () => {
      vi.mocked(retroCore.aggregateRetros).mockResolvedValue([]);

      const { exitCode } = await runCommand(retroCommand, [
        'retro',
        'aggregate',
        '--role',
        'senior-engineer',
        '--include-abandoned',
      ]);

      expect(exitCode).toBe(0);
      expect(retroCore.aggregateRetros).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          role: 'senior-engineer',
          includeAbandoned: true,
        }),
      );
    });

    it('exits with error when RetroError is thrown', async () => {
      vi.mocked(retroCore.aggregateRetros).mockRejectedValue(new RetroError('Aggregate failed'));

      const { stderr, exitCode } = await runCommand(retroCommand, ['retro', 'aggregate']);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Aggregate failed');
    });
  });
});
