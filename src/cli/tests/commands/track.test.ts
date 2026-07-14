import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache } from '../../../core/config/config.js';
import { runCommand } from '../helpers.js';
import { trackCommand } from '../../commands/track.js';
import * as trackCore from '../../../core/track/track.js';
import * as clipboardModule from '../../clipboard.js';
import * as stdinModule from '../../stdin.js';
import { TrackError, TrackCancelled, NoLinkStoredError } from '../../../core/track/errors.js';
import { UserInputError } from '../../errors.js';
import { SlugMissingError } from '../../slug.js';
import { ApplicationNotFoundError } from '../../../core/applications/index.js';
import type { TrackSummary } from '../../../core/track/track.js';
import type * as TrackCoreModule from '../../../core/track/track.js';

vi.mock('../../../core/track/track.js', async (importOriginal) => {
  const actual = await importOriginal<typeof TrackCoreModule>();
  return {
    ...actual,
    runTrack: vi.fn(),
    runTrackRefresh: vi.fn(),
    prepareTrack: vi.fn(),
    confirmAndCreate: vi.fn(),
  };
});

vi.mock('../../clipboard.js', () => ({
  readClipboard: vi.fn(),
}));

vi.mock('../../stdin.js', () => ({
  readStdin: vi.fn(),
}));

vi.mock('../../../core/spinner.js', () => ({
  withSpinner: vi.fn((_msg: string, _success: string, fn: () => Promise<unknown>) => fn()),
}));

describe('track command', () => {
  let testHome: string;
  let originalJhoConfigHome: string | undefined;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-track-'));
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

  describe('create flow (URL)', () => {
    const mockSummary: TrackSummary = {
      jd: {
        title: 'Senior Engineer',
        company: 'Acme Corp',
        location: 'Remote',
        description: 'Job description',
      },
      suggestion: { roleSlug: 'senior-dev', confidence: 0.9, reasoning: 'Good match' },
      targetRoles: [],
    };

    it('creates application from URL with --yes', async () => {
      vi.mocked(trackCore.prepareTrack).mockResolvedValue(mockSummary);
      vi.mocked(trackCore.confirmAndCreate).mockResolvedValue('2026-Jun-21-SE-Acme-Corp-12345');

      const { stdout, exitCode } = await runCommand(trackCommand, [
        'track',
        'https://example.com/job/12345',
        '--yes',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Created application:');
      expect(stdout).toContain('2026-Jun-21-SE-Acme-Corp-12345');
      expect(trackCore.prepareTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          campaign: 'default',
          url: 'https://example.com/job/12345',
        }),
      );
      expect(trackCore.confirmAndCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          campaign: 'default',
          url: 'https://example.com/job/12345',
          yes: true,
        }),
      );
    });

    it('creates application with custom status and tags', async () => {
      vi.mocked(trackCore.prepareTrack).mockResolvedValue(mockSummary);
      vi.mocked(trackCore.confirmAndCreate).mockResolvedValue('2026-Jun-21-BD-TechCo');

      const { exitCode } = await runCommand(trackCommand, [
        'track',
        'https://example.com/job/99',
        '--yes',
        '--status',
        'interview',
        '--tag',
        'urgent',
        '--tag',
        'remote',
        '--salary',
        '120k',
      ]);

      expect(exitCode).toBe(0);
      expect(trackCore.confirmAndCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com/job/99',
          status: 'interview',
          tags: ['urgent', 'remote'],
          salary: '120k',
        }),
      );
    });

    it('handles TrackCancelled during preparation', async () => {
      vi.mocked(trackCore.prepareTrack).mockRejectedValue(new TrackCancelled());

      const { exitCode } = await runCommand(trackCommand, ['track', 'https://example.com/job/1']);

      expect(exitCode).toBe(0);
    });

    it('handles TrackCancelled during confirmation', async () => {
      vi.mocked(trackCore.prepareTrack).mockResolvedValue(mockSummary);
      vi.mocked(trackCore.confirmAndCreate).mockRejectedValue(new TrackCancelled());

      const { exitCode } = await runCommand(trackCommand, ['track', 'https://example.com/job/1']);

      expect(exitCode).toBe(0);
    });

    it('handles TrackError during preparation', async () => {
      vi.mocked(trackCore.prepareTrack).mockRejectedValue(
        new TrackError('Failed to extract JD: fetch failed'),
      );

      const { stderr, exitCode } = await runCommand(trackCommand, [
        'track',
        'https://example.com/job/bad',
        '--yes',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Failed to extract JD');
    });

    it('handles TrackError during creation', async () => {
      vi.mocked(trackCore.prepareTrack).mockResolvedValue(mockSummary);
      vi.mocked(trackCore.confirmAndCreate).mockRejectedValue(new TrackError('Creation failed'));

      const { stderr, exitCode } = await runCommand(trackCommand, [
        'track',
        'https://example.com/job/bad',
        '--yes',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Creation failed');
    });

    it('throws unexpected errors', async () => {
      const unexpectedError = new Error('unexpected');
      vi.mocked(trackCore.prepareTrack).mockRejectedValue(unexpectedError);

      await expect(
        runCommand(trackCommand, ['track', 'https://example.com/job/bad', '--yes']),
      ).rejects.toThrow('unexpected');
    });
  });

  describe('update flow', () => {
    it('updates application with --yes', async () => {
      vi.mocked(trackCore.runTrack).mockResolvedValue({
        slug: '2026-Jun-21-SE-TestCo',
        changed: true,
      });

      const { stdout, exitCode } = await runCommand(trackCommand, [
        'track',
        '2026-Jun-21-SE-TestCo',
        '--status',
        'interview',
        '--yes',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Updated application:');
      expect(stdout).toContain('2026-Jun-21-SE-TestCo');
      expect(trackCore.runTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          campaign: 'default',
          slug: '2026-Jun-21-SE-TestCo',
          status: 'interview',
          yes: true,
        }),
      );
    });

    it('shows "no changes" when result.changed is false', async () => {
      vi.mocked(trackCore.runTrack).mockResolvedValue({
        slug: '2026-Jun-21-SE-TestCo',
        changed: false,
      });

      const { stdout, exitCode } = await runCommand(trackCommand, [
        'track',
        '2026-Jun-21-SE-TestCo',
        '--status',
        'interview',
        '--yes',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('No changes to apply for 2026-Jun-21-SE-TestCo.');
    });

    it('shows "no changes" when no update flags provided', async () => {
      const { stdout, exitCode } = await runCommand(trackCommand, [
        'track',
        '2026-Jun-21-SE-TestCo',
        '--yes',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('No changes to apply for 2026-Jun-21-SE-TestCo.');
      expect(trackCore.runTrack).not.toHaveBeenCalled();
    });

    it('handles TrackCancelled', async () => {
      vi.mocked(trackCore.runTrack).mockRejectedValue(new TrackCancelled());

      const { exitCode } = await runCommand(trackCommand, [
        'track',
        '2026-Jun-21-SE-TestCo',
        '--status',
        'interview',
      ]);

      expect(exitCode).toBe(0);
    });

    it('handles TrackError during update', async () => {
      vi.mocked(trackCore.runTrack).mockRejectedValue(
        new TrackError(
          'no changes specified\nhint: use --status, --salary, --tag, or --target-role',
        ),
      );

      const { stderr, exitCode } = await runCommand(trackCommand, [
        'track',
        '2026-Jun-21-SE-TestCo',
        '--status',
        'interview',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('no changes specified');
    });

    it('handles TrackError with missing slug hint', async () => {
      vi.mocked(trackCore.runTrack).mockRejectedValue(new TrackError('missing slug'));

      const { stderr, exitCode } = await runCommand(trackCommand, [
        'track',
        '2026-Jun-21-SE-TestCo',
        '--status',
        'interview',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('missing slug');
      expect(stderr).toContain('pass a slug, or run from inside the application folder');
    });

    it('handles UserInputError', async () => {
      vi.mocked(trackCore.runTrack).mockRejectedValue(new UserInputError('invalid input'));

      const { stderr, exitCode } = await runCommand(trackCommand, [
        'track',
        '2026-Jun-21-SE-TestCo',
        '--status',
        'interview',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('invalid input');
    });
  });

  describe('no-arg', () => {
    it('shows error when no URL or slug provided', async () => {
      const { stderr, exitCode } = await runCommand(trackCommand, [
        'track',
        '--status',
        'interview',
        '--yes',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('missing <slug> argument');
    });

    it('rejects invalid status', async () => {
      const { stderr, exitCode } = await runCommand(trackCommand, [
        'track',
        '2026-Jun-21-SE-TestCo',
        '--status',
        'bogus',
        '--yes',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('invalid status "bogus"');
      expect(stderr).toContain('applied, interview');
    });
  });

  describe('--paste', () => {
    const mockSummary: TrackSummary = {
      jd: {
        title: 'Senior Engineer',
        company: 'TestCo',
        location: 'Remote',
        description: 'Job description',
      },
      suggestion: { roleSlug: '', confidence: 0, reasoning: '' },
      targetRoles: [],
    };

    it('reads from clipboard and creates application', async () => {
      vi.mocked(clipboardModule.readClipboard).mockResolvedValue('Job description from clipboard');
      vi.mocked(trackCore.prepareTrack).mockResolvedValue(mockSummary);
      vi.mocked(trackCore.confirmAndCreate).mockResolvedValue('2026-Jun-21-SE-TestCo');

      const { exitCode } = await runCommand(trackCommand, [
        'track',
        'https://example.com/job/123',
        '--paste',
        '--yes',
      ]);

      expect(exitCode).toBe(0);
      expect(clipboardModule.readClipboard).toHaveBeenCalledOnce();
      expect(trackCore.prepareTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Job description from clipboard',
        }),
      );
    });
  });

  describe('--stdin', () => {
    const mockSummary: TrackSummary = {
      jd: {
        title: 'Senior Engineer',
        company: 'TestCo',
        location: 'Remote',
        description: 'Job description',
      },
      suggestion: { roleSlug: '', confidence: 0, reasoning: '' },
      targetRoles: [],
    };

    it('reads from stdin and creates application', async () => {
      vi.mocked(stdinModule.readStdin).mockResolvedValue('Job description from stdin');
      vi.mocked(trackCore.prepareTrack).mockResolvedValue(mockSummary);
      vi.mocked(trackCore.confirmAndCreate).mockResolvedValue('2026-Jun-21-SE-TestCo');

      const { exitCode } = await runCommand(trackCommand, [
        'track',
        'https://example.com/job/123',
        '--stdin',
        '--yes',
      ]);

      expect(exitCode).toBe(0);
      expect(stdinModule.readStdin).toHaveBeenCalledOnce();
      expect(trackCore.prepareTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Job description from stdin',
        }),
      );
    });
  });

  describe('--campaign', () => {
    const mockSummary: TrackSummary = {
      jd: {
        title: 'Senior Engineer',
        company: 'Acme',
        location: 'Remote',
        description: 'Job description',
      },
      suggestion: { roleSlug: '', confidence: 0, reasoning: '' },
      targetRoles: [],
    };

    it('uses the campaign from --campaign flag', async () => {
      vi.mocked(trackCore.prepareTrack).mockResolvedValue(mockSummary);
      vi.mocked(trackCore.confirmAndCreate).mockResolvedValue('2026-Jun-21-SE-Acme');

      const { exitCode } = await runCommand(
        trackCommand,
        ['--campaign', 'freelance', 'track', 'https://example.com/job/123', '--yes'],
        (parent) => parent.option('--campaign <name>', 'campaign name'),
      );

      expect(exitCode).toBe(0);
      expect(trackCore.prepareTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          campaign: 'freelance',
        }),
      );
      expect(trackCore.confirmAndCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          campaign: 'freelance',
        }),
      );
    });
  });

  describe('--help', () => {
    it('shows usage examples', async () => {
      const { stdout, exitCode } = await runCommand(trackCommand, ['track', '--help']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('jho track https://example.com/job/123');
      expect(stdout).toContain('--paste');
      expect(stdout).toContain('--stdin');
      expect(stdout).toContain('--refresh');
    });
  });

  describe('--refresh', () => {
    it('refreshes JD from stored URL', async () => {
      vi.mocked(trackCore.runTrackRefresh).mockResolvedValue({
        slug: '2026-Jun-21-SE-TestCo',
        changed: true,
      });

      const { stdout, exitCode } = await runCommand(trackCommand, [
        'track',
        '2026-Jun-21-SE-TestCo',
        '--refresh',
        '--yes',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Refreshed JD:');
      expect(stdout).toContain('2026-Jun-21-SE-TestCo');
      expect(trackCore.runTrackRefresh).toHaveBeenCalledWith(
        expect.objectContaining({
          campaign: 'default',
          slug: '2026-Jun-21-SE-TestCo',
          yes: true,
        }),
      );
    });

    it('passes --paste text to refresh', async () => {
      vi.mocked(clipboardModule.readClipboard).mockResolvedValue('New JD from clipboard');
      vi.mocked(trackCore.runTrackRefresh).mockResolvedValue({
        slug: '2026-Jun-21-SE-TestCo',
        changed: true,
      });

      const { exitCode } = await runCommand(trackCommand, [
        'track',
        '2026-Jun-21-SE-TestCo',
        '--refresh',
        '--paste',
        '--yes',
      ]);

      expect(exitCode).toBe(0);
      expect(trackCore.runTrackRefresh).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'New JD from clipboard',
        }),
      );
    });

    it('passes --stdin text to refresh', async () => {
      vi.mocked(stdinModule.readStdin).mockResolvedValue('New JD from stdin');
      vi.mocked(trackCore.runTrackRefresh).mockResolvedValue({
        slug: '2026-Jun-21-SE-TestCo',
        changed: true,
      });

      const { exitCode } = await runCommand(trackCommand, [
        'track',
        '2026-Jun-21-SE-TestCo',
        '--refresh',
        '--stdin',
        '--yes',
      ]);

      expect(exitCode).toBe(0);
      expect(trackCore.runTrackRefresh).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'New JD from stdin',
        }),
      );
    });

    it('handles TrackError during refresh with paste hint', async () => {
      vi.mocked(trackCore.runTrackRefresh).mockRejectedValue(
        new TrackError('Failed to refresh JD: fetch failed'),
      );

      const { stderr, exitCode } = await runCommand(trackCommand, [
        'track',
        '2026-Jun-21-SE-TestCo',
        '--refresh',
        '--yes',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Failed to refresh JD');
      expect(stderr).toContain('--refresh --paste');
    });

    it('handles NoLinkStoredError during refresh with hint', async () => {
      vi.mocked(trackCore.runTrackRefresh).mockRejectedValue(
        new NoLinkStoredError('2026-Jun-21-SE-TestCo'),
      );

      const { stderr, exitCode } = await runCommand(trackCommand, [
        'track',
        '2026-Jun-21-SE-TestCo',
        '--refresh',
        '--yes',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('no link stored for');
      expect(stderr).toContain('--paste');
    });

    it('skips paste hint when TrackError during refresh with --paste', async () => {
      vi.mocked(trackCore.runTrackRefresh).mockRejectedValue(
        new TrackError('Failed to refresh JD: extract failed'),
      );

      const { stderr, exitCode } = await runCommand(trackCommand, [
        'track',
        '2026-Jun-21-SE-TestCo',
        '--refresh',
        '--paste',
        '--yes',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Failed to refresh JD');
      expect(stderr).not.toContain('--refresh --paste');
    });
  });

  describe('error handling', () => {
    it('handles SlugMissingError', async () => {
      vi.mocked(trackCore.runTrack).mockRejectedValue(new SlugMissingError());

      const { stderr, exitCode } = await runCommand(trackCommand, [
        'track',
        '2026-Jun-21-SE-TestCo',
        '--status',
        'interview',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('missing <slug> argument');
    });

    it('handles ApplicationNotFoundError', async () => {
      vi.mocked(trackCore.runTrack).mockRejectedValue(
        new ApplicationNotFoundError('2026-Jun-21-SE-TestCo'),
      );

      const { stderr, exitCode } = await runCommand(trackCommand, [
        'track',
        '2026-Jun-21-SE-TestCo',
        '--status',
        'interview',
      ]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('application not found');
    });
  });
});
