import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache } from '../../../core/config.js';
import { runCommand } from '../helpers.js';
import { interviewCommand } from '../../commands/interview.js';
import * as interviewsCore from '../../../core/interviews/index.js';
import { InterviewError } from '../../../core/interviews/index.js';

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
      expect(stdout).toContain('Interview #1 added');
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
      expect(stdout).toContain('Interview #2 added');
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
});
