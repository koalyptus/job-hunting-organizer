import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache } from '../../../core/config.js';
import { runCommand } from '../helpers.js';
import { interviewCommand } from '../../commands/interview.js';
import * as interviewsCore from '../../../core/interviews/index.js';
import { InterviewError, InterviewNotFoundError } from '../../../core/interviews/index.js';

vi.mock('../../../core/interviews/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof interviewsCore>();
  return {
    ...actual,
    addInterview: vi.fn(),
    listInterviews: vi.fn(),
    markInterviewStatus: vi.fn(),
    appendInterviewNotes: vi.fn(),
  };
});

vi.mock('../../../core/spinner.js', () => ({
  withSpinner: vi.fn((_msg: string, _success: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('@clack/prompts', () => ({
  text: vi.fn(),
  select: vi.fn(),
  isCancel: vi.fn(() => false),
  log: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('interview command', () => {
  let testHome: string;
  let originalJhoConfigHome: string | undefined;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-interview-'));
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

  describe('add subcommand', () => {
    it('adds interview with explicit slug', async () => {
      vi.mocked(interviewsCore.addInterview).mockResolvedValue({ index: 1 });

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });
      await writeFile(
        join(campaignDir, 'applied', slug, 'meta.md'),
        '---\nslug: ' +
          slug +
          '\ntitle: Software Engineer\ncompany: Test Corp\nstatus: applied\n---\n',
      );

      const { stdout, exitCode } = await runCommand(interviewCommand, [
        'interview',
        'add',
        slug,
        '--when',
        '2026-06-15 10:00',
        '--type',
        'technical',
        '--duration',
        '60',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Interview saved to:');
      expect(stdout).toContain('interviews.md');
      expect(stdout).toContain('interview-2026-06-15-technical.ics');
      expect(stdout).toContain('Next steps:');
      expect(stdout).toContain('jho interview list');
      expect(stdout).toContain('jho interview mark');
      expect(stdout).toContain('jho prepare');
      expect(interviewsCore.addInterview).toHaveBeenCalledWith(
        expect.any(String),
        slug,
        expect.objectContaining({
          when: '2026-06-15 10:00',
          type: 'technical',
          duration: 60,
        }),
      );
    });

    it('adds interview with optional fields', async () => {
      vi.mocked(interviewsCore.addInterview).mockResolvedValue({ index: 2 });

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });
      await writeFile(
        join(campaignDir, 'applied', slug, 'meta.md'),
        '---\nslug: ' +
          slug +
          '\ntitle: Software Engineer\ncompany: Test Corp\nstatus: applied\n---\n',
      );

      const { stdout, exitCode } = await runCommand(interviewCommand, [
        'interview',
        'add',
        slug,
        '--when',
        '2026-06-15 14:00',
        '--interviewer',
        'A. Smith',
        '--location',
        'Google Meet',
        '--title',
        'Phone Screen',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Interview saved to:');
      expect(stdout).toContain('interviews.md');
      expect(stdout).toContain('interview-2026-06-15-technical.ics');
      expect(stdout).toContain('Next steps:');
      expect(interviewsCore.addInterview).toHaveBeenCalledWith(
        expect.any(String),
        slug,
        expect.objectContaining({
          when: '2026-06-15 14:00',
          interviewers: 'A. Smith',
          location: 'Google Meet',
          title: 'Phone Screen',
        }),
      );
    });

    it('exits with error when slug is missing', async () => {
      const { stderr, exitCode } = await runCommand(interviewCommand, [
        'interview',
        'add',
        '--when',
        '2026-06-15 10:00',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('missing <slug> argument');
    });

    it('exits with error for invalid datetime format', async () => {
      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(interviewCommand, [
        'interview',
        'add',
        slug,
        '--when',
        'not-a-date',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Invalid date/time');
    });

    it('exits with error for invalid month', async () => {
      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(interviewCommand, [
        'interview',
        'add',
        slug,
        '--when',
        '2026-13-15 10:00',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('month must be 01-12');
    });

    it('exits with error for invalid day', async () => {
      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(interviewCommand, [
        'interview',
        'add',
        slug,
        '--when',
        '2026-06-32 10:00',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('day must be 01-31');
    });

    it('exits with error for invalid hour', async () => {
      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(interviewCommand, [
        'interview',
        'add',
        slug,
        '--when',
        '2026-06-15 25:00',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('hour must be 00-23');
    });

    it('exits with error for invalid minute', async () => {
      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(interviewCommand, [
        'interview',
        'add',
        slug,
        '--when',
        '2026-06-15 10:60',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('minute must be 00-59');
    });

    it('exits with error for 30-day month with 31 days', async () => {
      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(interviewCommand, [
        'interview',
        'add',
        slug,
        '--when',
        '2026-04-31 10:00',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('month 4 has at most 30 days');
    });

    it('accepts datetime with seconds', async () => {
      vi.mocked(interviewsCore.addInterview).mockResolvedValue({ index: 1 });

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });
      await writeFile(
        join(campaignDir, 'applied', slug, 'meta.md'),
        '---\nslug: ' +
          slug +
          '\ntitle: Software Engineer\ncompany: Test Corp\nstatus: applied\n---\n',
      );

      const { exitCode } = await runCommand(interviewCommand, [
        'interview',
        'add',
        slug,
        '--when',
        '2026-06-15 10:30:45',
      ]);

      expect(exitCode).toBe(0);
      expect(interviewsCore.addInterview).toHaveBeenCalledWith(
        expect.any(String),
        slug,
        expect.objectContaining({ when: '2026-06-15 10:30:45' }),
      );
    });

    it('exits with error when InterviewError is thrown', async () => {
      vi.mocked(interviewsCore.addInterview).mockRejectedValue(
        new InterviewError('Invalid date format'),
      );

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(interviewCommand, [
        'interview',
        'add',
        slug,
        '--when',
        '2026-06-15 10:00',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Invalid date format');
    });

    it('enters wizard mode when --when is not provided', async () => {
      const { text, select } = await import('@clack/prompts');
      vi.mocked(text)
        .mockResolvedValueOnce('2026-07-15 10:00')
        .mockResolvedValueOnce('60')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('');
      vi.mocked(select).mockResolvedValueOnce('technical');
      vi.mocked(interviewsCore.addInterview).mockResolvedValue({ index: 1 });

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stdout, exitCode } = await runCommand(interviewCommand, ['interview', 'add', slug]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Interview saved to:');
      expect(stdout).toContain('interviews.md');
      expect(stdout).toContain('interview-2026-07-15-technical.ics');
      expect(stdout).toContain('Next steps:');
      expect(text).toHaveBeenCalled();
      expect(select).toHaveBeenCalled();
      expect(interviewsCore.addInterview).toHaveBeenCalledWith(
        expect.any(String),
        slug,
        expect.objectContaining({
          when: '2026-07-15 10:00',
          type: 'technical',
          duration: 60,
        }),
      );
    });

    it('wizard mode passes optional fields when provided', async () => {
      const { text, select } = await import('@clack/prompts');
      vi.mocked(text)
        .mockResolvedValueOnce('2026-07-15 14:00')
        .mockResolvedValueOnce('45')
        .mockResolvedValueOnce('Jane Doe')
        .mockResolvedValueOnce('Google Meet')
        .mockResolvedValueOnce('Phone Screen');
      vi.mocked(select).mockResolvedValueOnce('hr');
      vi.mocked(interviewsCore.addInterview).mockResolvedValue({ index: 2 });

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stdout, exitCode } = await runCommand(interviewCommand, ['interview', 'add', slug]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Interview saved to:');
      expect(stdout).toContain('interviews.md');
      expect(stdout).toContain('interview-2026-07-15-hr.ics');
      expect(stdout).toContain('Next steps:');
      expect(interviewsCore.addInterview).toHaveBeenCalledWith(
        expect.any(String),
        slug,
        expect.objectContaining({
          when: '2026-07-15 14:00',
          type: 'hr',
          duration: 45,
          interviewers: 'Jane Doe',
          location: 'Google Meet',
          title: 'Phone Screen',
        }),
      );
    });

    it('wizard mode exits when user cancels', async () => {
      const { text } = await import('@clack/prompts');
      const { isCancel } = await import('@clack/prompts');
      vi.mocked(text).mockResolvedValueOnce('2026-07-15 10:00');
      vi.mocked(isCancel).mockReturnValueOnce(true);

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { exitCode } = await runCommand(interviewCommand, ['interview', 'add', slug]);

      expect(exitCode).toBe(0);
    });
  });

  describe('list subcommand', () => {
    it('lists interviews with explicit slug', async () => {
      vi.mocked(interviewsCore.listInterviews).mockResolvedValue([
        {
          index: 1,
          when: '2026-06-15 10:00',
          title: 'Technical',
          type: 'technical',
          interviewers: '',
          location: '',
          status: 'scheduled',
          topics: '',
          notes: '',
          duration: 60,
        },
      ]);

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stdout, exitCode } = await runCommand(interviewCommand, ['interview', 'list', slug]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('1');
      expect(stdout).toContain('technical');
      expect(stdout).toContain('scheduled');
    });

    it('shows message when no interviews found', async () => {
      vi.mocked(interviewsCore.listInterviews).mockResolvedValue([]);

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stdout, exitCode } = await runCommand(interviewCommand, ['interview', 'list', slug]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('No interviews found');
    });

    it('exits with error when slug is missing', async () => {
      const { stderr, exitCode } = await runCommand(interviewCommand, ['interview', 'list']);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('missing <slug> argument');
    });
  });

  describe('mark subcommand', () => {
    it('marks interview status with explicit slug', async () => {
      vi.mocked(interviewsCore.markInterviewStatus).mockResolvedValue(true);

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stdout, exitCode } = await runCommand(interviewCommand, [
        'interview',
        'mark',
        slug,
        '1',
        '--status',
        'passed',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Interview #1 marked as passed');
      expect(interviewsCore.markInterviewStatus).toHaveBeenCalledWith(expect.any(String), slug, {
        sectionNumber: 1,
        status: 'passed',
      });
    });

    it('exits with error for invalid interview number', async () => {
      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(interviewCommand, [
        'interview',
        'mark',
        slug,
        'abc',
        '--status',
        'passed',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('positive integer');
    });

    it('exits with error when InterviewError is thrown', async () => {
      vi.mocked(interviewsCore.markInterviewStatus).mockRejectedValue(
        new InterviewError('Section not found'),
      );

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(interviewCommand, [
        'interview',
        'mark',
        slug,
        '1',
        '--status',
        'passed',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Section not found');
    });
  });

  describe('notes subcommand', () => {
    it('appends notes with explicit slug', async () => {
      vi.mocked(interviewsCore.appendInterviewNotes).mockResolvedValue(true);

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stdout, exitCode } = await runCommand(interviewCommand, [
        'interview',
        'notes',
        slug,
        '1',
        '--append',
        'They asked about distributed systems',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Notes appended to interview #1');
      expect(interviewsCore.appendInterviewNotes).toHaveBeenCalledWith(expect.any(String), slug, {
        sectionNumber: 1,
        notes: 'They asked about distributed systems',
      });
    });

    it('exits with error for invalid interview number', async () => {
      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(interviewCommand, [
        'interview',
        'notes',
        slug,
        '0',
        '--append',
        'Some notes',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('positive integer');
    });

    it('exits with error when InterviewError is thrown', async () => {
      vi.mocked(interviewsCore.appendInterviewNotes).mockRejectedValue(
        new InterviewError('Failed to write'),
      );

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(interviewCommand, [
        'interview',
        'notes',
        slug,
        '1',
        '--append',
        'Some notes',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Failed to write');
    });
  });

  describe('help text', () => {
    it('contains examples', async () => {
      const helpOutput = interviewCommand.helpInformation();
      expect(helpOutput).toContain('interview pipeline');
      expect(helpOutput).toContain('add');
      expect(helpOutput).toContain('list');
      expect(helpOutput).toContain('mark');
      expect(helpOutput).toContain('notes');
    });
  });

  describe('slug inference (cwd)', () => {
    it('add infers slug from cwd', async () => {
      vi.mocked(interviewsCore.addInterview).mockResolvedValue({ index: 1 });

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      const appDir = join(campaignDir, 'applied', slug);
      await mkdir(appDir, { recursive: true });
      await writeFile(
        join(appDir, 'meta.md'),
        '---\nslug: ' +
          slug +
          '\ntitle: Software Engineer\ncompany: Test Corp\nstatus: applied\n---\n',
      );

      const origCwd = process.cwd();
      process.chdir(appDir);
      try {
        const { stdout, exitCode } = await runCommand(interviewCommand, [
          'interview',
          'add',
          '--when',
          '2026-06-15 10:00',
          '--type',
          'technical',
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('Interview saved to:');
        expect(interviewsCore.addInterview).toHaveBeenCalledWith(
          expect.any(String),
          slug,
          expect.objectContaining({ when: '2026-06-15 10:00', type: 'technical' }),
        );
      } finally {
        process.chdir(origCwd);
      }
    });

    it('list infers slug from cwd', async () => {
      vi.mocked(interviewsCore.listInterviews).mockResolvedValue([
        {
          index: 1,
          when: '2026-06-15 10:00',
          title: '',
          type: 'technical',
          interviewers: '',
          location: '',
          status: 'scheduled',
          topics: '',
          notes: '',
          duration: 60,
        },
      ]);

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      const appDir = join(campaignDir, 'applied', slug);
      await mkdir(appDir, { recursive: true });

      const origCwd = process.cwd();
      process.chdir(appDir);
      try {
        const { stdout, exitCode } = await runCommand(interviewCommand, ['interview', 'list']);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('technical');
        expect(interviewsCore.listInterviews).toHaveBeenCalledWith(expect.any(String), slug);
      } finally {
        process.chdir(origCwd);
      }
    });

    it('mark infers slug when provided explicitly and cwd is inside app folder', async () => {
      vi.mocked(interviewsCore.markInterviewStatus).mockResolvedValue(true);

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      const appDir = join(campaignDir, 'applied', slug);
      await mkdir(appDir, { recursive: true });

      const origCwd = process.cwd();
      process.chdir(appDir);
      try {
        const { stdout, exitCode } = await runCommand(interviewCommand, [
          'interview',
          'mark',
          slug,
          '1',
          '--status',
          'passed',
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('Interview #1 marked as passed');
        expect(interviewsCore.markInterviewStatus).toHaveBeenCalledWith(expect.any(String), slug, {
          sectionNumber: 1,
          status: 'passed',
        });
      } finally {
        process.chdir(origCwd);
      }
    });

    it('notes infers slug when provided explicitly and cwd is inside app folder', async () => {
      vi.mocked(interviewsCore.appendInterviewNotes).mockResolvedValue(true);

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      const appDir = join(campaignDir, 'applied', slug);
      await mkdir(appDir, { recursive: true });

      const origCwd = process.cwd();
      process.chdir(appDir);
      try {
        const { stdout, exitCode } = await runCommand(interviewCommand, [
          'interview',
          'notes',
          slug,
          '1',
          '--append',
          'Notes here',
        ]);

        expect(exitCode).toBe(0);
        expect(stdout).toContain('Notes appended to interview #1');
        expect(interviewsCore.appendInterviewNotes).toHaveBeenCalledWith(expect.any(String), slug, {
          sectionNumber: 1,
          notes: 'Notes here',
        });
      } finally {
        process.chdir(origCwd);
      }
    });
  });

  describe('parent action (alias for add)', () => {
    it('runs wizard mode and adds interview', async () => {
      const { text, select } = await import('@clack/prompts');
      vi.mocked(text)
        .mockResolvedValueOnce('2026-08-01 09:00')
        .mockResolvedValueOnce('30')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('');
      vi.mocked(select).mockResolvedValueOnce('hr');
      vi.mocked(interviewsCore.addInterview).mockResolvedValue({ index: 1 });

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stdout, exitCode } = await runCommand(interviewCommand, ['interview', slug]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Interview saved to:');
      expect(stdout).toContain('interview-2026-08-01-hr.ics');
      expect(interviewsCore.addInterview).toHaveBeenCalledWith(
        expect.any(String),
        slug,
        expect.objectContaining({ when: '2026-08-01 09:00', type: 'hr', duration: 30 }),
      );
    });

    it('exits with error when InterviewError is thrown', async () => {
      const { text, select } = await import('@clack/prompts');
      vi.mocked(text).mockResolvedValueOnce('2026-08-01 09:00');
      vi.mocked(select).mockResolvedValueOnce('technical');
      vi.mocked(interviewsCore.addInterview).mockRejectedValue(
        new InterviewError('Application folder not found'),
      );

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(interviewCommand, ['interview', slug]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Application folder not found');
    });

    it('exits with error when InterviewNotFoundError is thrown', async () => {
      const { text, select } = await import('@clack/prompts');
      vi.mocked(text).mockResolvedValueOnce('2026-08-01 09:00');
      vi.mocked(select).mockResolvedValueOnce('technical');
      vi.mocked(interviewsCore.addInterview).mockRejectedValue(
        new InterviewNotFoundError('not-found'),
      );

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(interviewCommand, ['interview', slug]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('create the application first with: jho track');
    });
  });

  describe('wizard cancel coverage', () => {
    it('exits when user cancels on type select', async () => {
      const { text, select, isCancel } = await import('@clack/prompts');
      vi.mocked(text).mockResolvedValueOnce('2026-07-15 10:00');
      vi.mocked(isCancel).mockReturnValueOnce(false);
      vi.mocked(select).mockResolvedValueOnce(undefined);
      vi.mocked(isCancel).mockReturnValueOnce(true);

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { exitCode } = await runCommand(interviewCommand, ['interview', 'add', slug]);
      expect(exitCode).toBe(0);
    });

    it('exits when user cancels on duration', async () => {
      const { text, select, isCancel } = await import('@clack/prompts');
      vi.mocked(text)
        .mockResolvedValueOnce('2026-07-15 10:00')
        .mockResolvedValueOnce(Symbol('cancel') as unknown as string);
      vi.mocked(isCancel)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);
      vi.mocked(select).mockResolvedValueOnce('technical');

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { exitCode } = await runCommand(interviewCommand, ['interview', 'add', slug]);
      expect(exitCode).toBe(0);
    });

    it('exits when user cancels on interviewer', async () => {
      const { text, select, isCancel } = await import('@clack/prompts');
      vi.mocked(text)
        .mockResolvedValueOnce('2026-07-15 10:00')
        .mockResolvedValueOnce('60')
        .mockResolvedValueOnce(Symbol('cancel') as unknown as string);
      vi.mocked(isCancel)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);
      vi.mocked(select).mockResolvedValueOnce('technical');

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { exitCode } = await runCommand(interviewCommand, ['interview', 'add', slug]);
      expect(exitCode).toBe(0);
    });

    it('exits when user cancels on location', async () => {
      const { text, select, isCancel } = await import('@clack/prompts');
      vi.mocked(text)
        .mockResolvedValueOnce('2026-07-15 10:00')
        .mockResolvedValueOnce('60')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(Symbol('cancel') as unknown as string);
      vi.mocked(isCancel)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);
      vi.mocked(select).mockResolvedValueOnce('technical');

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { exitCode } = await runCommand(interviewCommand, ['interview', 'add', slug]);
      expect(exitCode).toBe(0);
    });

    it('exits when user cancels on title', async () => {
      const { text, select, isCancel } = await import('@clack/prompts');
      vi.mocked(text)
        .mockResolvedValueOnce('2026-07-15 10:00')
        .mockResolvedValueOnce('60')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(Symbol('cancel') as unknown as string);
      vi.mocked(isCancel)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);
      vi.mocked(select).mockResolvedValueOnce('technical');

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { exitCode } = await runCommand(interviewCommand, ['interview', 'add', slug]);
      expect(exitCode).toBe(0);
    });
  });

  describe('ICS file', () => {
    it('writes ICS file to application folder', async () => {
      vi.mocked(interviewsCore.addInterview).mockResolvedValue({ index: 1 });

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      const appDir = join(campaignDir, 'applied', slug);
      await mkdir(appDir, { recursive: true });
      await writeFile(
        join(appDir, 'meta.md'),
        '---\nslug: ' +
          slug +
          '\ntitle: Software Engineer\ncompany: Test Corp\nstatus: applied\n---\n',
      );

      const { exitCode } = await runCommand(interviewCommand, [
        'interview',
        'add',
        slug,
        '--when',
        '2026-06-15 10:00',
        '--type',
        'technical',
        '--duration',
        '60',
      ]);

      expect(exitCode).toBe(0);

      // Verify the ICS file was created
      const { readFile } = await import('node:fs/promises');
      const icsPath = join(appDir, 'interview-2026-06-15-technical.ics');
      const icsContent = await readFile(icsPath, 'utf8');
      expect(icsContent).toContain('BEGIN:VCALENDAR');
      expect(icsContent).toContain('BEGIN:VEVENT');
      expect(icsContent).toContain('Interview #1 (technical)');
      expect(icsContent).toContain('CONFIRMED');
      expect(icsContent).toContain('END:VEVENT');
      expect(icsContent).toContain('END:VCALENDAR');
    });

    it('uses title in ICS when provided', async () => {
      vi.mocked(interviewsCore.addInterview).mockResolvedValue({ index: 1 });

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      const appDir = join(campaignDir, 'applied', slug);
      await mkdir(appDir, { recursive: true });
      await writeFile(
        join(appDir, 'meta.md'),
        '---\nslug: ' +
          slug +
          '\ntitle: Software Engineer\ncompany: Test Corp\nstatus: applied\n---\n',
      );

      await runCommand(interviewCommand, [
        'interview',
        'add',
        slug,
        '--when',
        '2026-06-15 10:00',
        '--type',
        'technical',
        '--title',
        'System Design Round',
      ]);

      const { readFile } = await import('node:fs/promises');
      const icsContent = await readFile(join(appDir, 'interview-2026-06-15-technical.ics'), 'utf8');
      expect(icsContent).toContain('System Design Round');
    });

    it('includes location in ICS when provided', async () => {
      vi.mocked(interviewsCore.addInterview).mockResolvedValue({ index: 1 });

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      const appDir = join(campaignDir, 'applied', slug);
      await mkdir(appDir, { recursive: true });
      await writeFile(
        join(appDir, 'meta.md'),
        '---\nslug: ' +
          slug +
          '\ntitle: Software Engineer\ncompany: Test Corp\nstatus: applied\n---\n',
      );

      await runCommand(interviewCommand, [
        'interview',
        'add',
        slug,
        '--when',
        '2026-06-15 10:00',
        '--type',
        'technical',
        '--location',
        'Google Meet',
      ]);

      const { readFile } = await import('node:fs/promises');
      const icsContent = await readFile(join(appDir, 'interview-2026-06-15-technical.ics'), 'utf8');
      expect(icsContent).toContain('Google Meet');
    });
  });

  describe('missing required options', () => {
    it('mark requires --status', async () => {
      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(interviewCommand, [
        'interview',
        'mark',
        slug,
        '1',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('required option');
    });

    it('notes requires --append', async () => {
      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(interviewCommand, [
        'interview',
        'notes',
        slug,
        '1',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('required option');
    });

    it('mark requires <n> argument', async () => {
      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(interviewCommand, [
        'interview',
        'mark',
        slug,
        '--status',
        'passed',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('missing');
    });

    it('notes requires <n> argument', async () => {
      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(interviewCommand, [
        'interview',
        'notes',
        slug,
        '--append',
        'notes',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('missing');
    });
  });

  describe('InterviewNotFoundError handling', () => {
    it('add shows hint when application not found', async () => {
      vi.mocked(interviewsCore.addInterview).mockRejectedValue(
        new InterviewNotFoundError('not-found'),
      );

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stderr, exitCode } = await runCommand(interviewCommand, [
        'interview',
        'add',
        slug,
        '--when',
        '2026-06-15 10:00',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('create the application first with: jho track');
    });
  });

  describe('generic error handling', () => {
    it('add rethrows non-InterviewError', async () => {
      vi.mocked(interviewsCore.addInterview).mockRejectedValue(new Error('unexpected'));

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      await expect(
        runCommand(interviewCommand, ['interview', 'add', slug, '--when', '2026-06-15 10:00']),
      ).rejects.toThrow('unexpected');
    });
  });
});
