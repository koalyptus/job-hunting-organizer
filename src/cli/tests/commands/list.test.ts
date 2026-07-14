import { Option, type Command } from 'commander';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCommand } from '../helpers.js';
import { listCommand } from '../../commands/list.js';
import * as listCoreModule from '../../../core/list/index.js';
import type { ApplicationEntry } from '../../../core/applications/types.js';

function parentSetup(parent: Command): void {
  parent.addOption(new Option('--campaign <name>', 'campaign to operate on'));
}

vi.mock('../../../core/list/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof listCoreModule>();
  return {
    ...actual,
    runListApplications: vi.fn(),
  };
});

describe('list command', () => {
  let testHome: string;

  beforeEach(async () => {
    testHome = await mkdtemp(join(tmpdir(), 'jho-list-'));
    process.env['JHO_CONFIG_HOME'] = join(testHome, '.jho');
    process.env['JHO_DATA'] = join(testHome, 'data');

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
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env['JHO_CONFIG_HOME'];
    delete process.env['JHO_DATA'];
    await rm(testHome, { recursive: true, force: true });
  });

  describe('campaign mode (no --campaign)', () => {
    it('shows "No campaigns found." when empty', async () => {
      await mkdir(join(testHome, 'data', 'campaigns'), { recursive: true });
      const { stderr: _stderr, exitCode, stdout } = await runCommand(listCommand, ['list']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No campaigns found.');
    });

    it('lists campaigns with application counts', async () => {
      const cRoot = join(testHome, 'data', 'campaigns');
      await mkdir(join(cRoot, 'default', 'applied'), { recursive: true });
      await mkdir(join(cRoot, 'freelance', 'applied'), { recursive: true });
      await writeFile(
        join(cRoot, 'default', 'applied', '.index.json'),
        JSON.stringify([{ slug: '2026-Jun-01-test-co' }], null, 2) + '\n',
      );

      const { stderr: _stderr, exitCode, stdout } = await runCommand(listCommand, ['list']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Campaign');
      expect(stdout).toContain('default');
      expect(stdout).toContain('1 application');
      expect(stdout).toContain('freelance');
      expect(stdout).toContain('0 applications');
    });

    it('outputs JSON with --json', async () => {
      const cRoot = join(testHome, 'data', 'campaigns');
      await mkdir(join(cRoot, 'default', 'applied'), { recursive: true });
      await writeFile(
        join(cRoot, 'default', 'applied', '.index.json'),
        JSON.stringify([{ slug: '2026-Jun-01-test-co' }], null, 2) + '\n',
      );

      const {
        stderr: _stderr,
        exitCode,
        stdout,
      } = await runCommand(listCommand, ['list', '--json']);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout.trim());
      expect(parsed).toHaveLength(1);
      expect(parsed[0]!.name).toBe('default');
      expect(parsed[0]!.applicationCount).toBe(1);
    });

    it('ignores --status flag silently in campaign mode', async () => {
      await mkdir(join(testHome, 'data', 'campaigns'), { recursive: true });
      const {
        stderr: _stderr,
        exitCode,
        stdout,
      } = await runCommand(listCommand, ['list', '--status', 'interview']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No campaigns found.');
    });
  });

  describe('application mode (with --campaign)', () => {
    beforeEach(async () => {
      const cRoot = join(testHome, 'data', 'campaigns');
      await mkdir(join(cRoot, 'default', 'applied'), { recursive: true });
      await writeFile(
        join(cRoot, 'default', 'config.json'),
        JSON.stringify({
          version: 1,
          profile: { path: '' },
          cv: { path: '' },
          linkedin: { url: '' },
          applied: { dir: '' },
          knowledgeBase: { dir: '' },
        }),
      );

      vi.mocked(listCoreModule.runListApplications).mockResolvedValue({
        entries: [
          {
            slug: '2026-Jun-01-SE-Acme-123',
            status: 'applied',
            title: 'Software Engineer',
            company: 'Acme Corp',
            site: 'Seek',
            location: 'Sydney NSW',
            targetRole: 'senior-backend-engineer',
            appliedOn: '2026-06-01',
            tags: ['typescript'],
            employmentType: 'permanent',
          },
          {
            slug: '2026-Jun-02-SE-Beta-456',
            status: 'interview',
            title: 'Senior Engineer',
            company: 'Beta Inc',
            site: 'LinkedIn',
            location: 'Remote',
            targetRole: 'staff-engineer',
            appliedOn: '2026-06-02',
            tags: ['typescript', 'react'],
            employmentType: 'contract',
          },
          {
            slug: '2026-Jun-06-sparse-entry',
            status: undefined as unknown as ApplicationEntry['status'],
            title: undefined as unknown as string,
            company: undefined as unknown as string,
            site: '',
            location: undefined as unknown as string,
            targetRole: '',
            appliedOn: undefined as unknown as string,
            tags: [],
            employmentType: '',
          },
        ],
      });
    });

    it('lists all applications', async () => {
      const {
        stderr: _stderr,
        exitCode,
        stdout,
      } = await runCommand(listCommand, ['list', '--campaign', 'default'], parentSetup);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Title');
      expect(stdout).toContain('2026-Jun-01-SE-Acme-123');
      expect(stdout).toContain('2026-Jun-02-SE-Beta-456');
      expect(stdout).toContain('Acme Corp');
      expect(stdout).toContain('Beta Inc');
      expect(stdout).toContain('3 applications');
      expect(stdout).toContain('2026-Jun-06-sparse-entry');
      // Sparse entry fields default to empty string
      expect(stdout).toContain('Title: ');
      expect(stdout).toContain('Status: applied');
    });

    it('filters by status', async () => {
      vi.mocked(listCoreModule.runListApplications).mockResolvedValue({
        entries: [
          {
            slug: '2026-Jun-02-SE-Beta-456',
            status: 'interview',
            title: 'Senior Engineer',
            company: 'Beta Inc',
            site: 'LinkedIn',
            location: 'Remote',
            targetRole: 'staff-engineer',
            appliedOn: '2026-06-02',
            tags: ['typescript', 'react'],
            employmentType: 'contract',
          },
        ],
      });

      const { stderr: _stderr, exitCode } = await runCommand(
        listCommand,
        ['list', '--campaign', 'default', '--status', 'interview'],
        parentSetup,
      );
      expect(exitCode).toBe(0);
    });

    it('filters by tag', async () => {
      vi.mocked(listCoreModule.runListApplications).mockResolvedValue({
        entries: [
          {
            slug: '2026-Jun-02-SE-Beta-456',
            status: 'interview',
            title: 'Senior Engineer',
            company: 'Beta Inc',
            site: 'LinkedIn',
            location: 'Remote',
            targetRole: 'staff-engineer',
            appliedOn: '2026-06-02',
            tags: ['typescript', 'react'],
            employmentType: 'contract',
          },
        ],
      });

      const { stderr: _stderr, exitCode } = await runCommand(
        listCommand,
        ['list', '--campaign', 'default', '--tag', 'react'],
        parentSetup,
      );
      expect(exitCode).toBe(0);
    });

    it('filters by role', async () => {
      vi.mocked(listCoreModule.runListApplications).mockResolvedValue({
        entries: [
          {
            slug: '2026-Jun-01-SE-Acme-123',
            status: 'applied',
            title: 'Software Engineer',
            company: 'Acme Corp',
            site: 'Seek',
            location: 'Sydney NSW',
            targetRole: 'senior-backend-engineer',
            appliedOn: '2026-06-01',
            tags: ['typescript'],
            employmentType: 'permanent',
          },
        ],
      });

      const { stderr: _stderr, exitCode } = await runCommand(
        listCommand,
        ['list', '--campaign', 'default', '--role', 'senior-backend-engineer'],
        parentSetup,
      );
      expect(exitCode).toBe(0);
    });

    it('outputs JSON with --json', async () => {
      const {
        stderr: _stderr,
        exitCode,
        stdout,
      } = await runCommand(listCommand, ['list', '--campaign', 'default', '--json'], parentSetup);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout.trim());
      expect(parsed).toHaveLength(3);
      expect(parsed[0]!.company).toBe('Acme Corp');
    });

    it('shows "No applications found." when empty', async () => {
      vi.mocked(listCoreModule.runListApplications).mockResolvedValue({ entries: [] });
      const {
        stderr: _stderr,
        exitCode,
        stdout,
      } = await runCommand(listCommand, ['list', '--campaign', 'default'], parentSetup);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No applications found.');
    });

    it('applies status color for all status types', async () => {
      vi.mocked(listCoreModule.runListApplications).mockResolvedValue({
        entries: [
          {
            slug: '2026-Jun-03-offer-co',
            status: 'offer',
            title: 'Role',
            company: 'Offer Co',
            site: '',
            location: '',
            targetRole: '',
            appliedOn: '2026-06-03',
            tags: [],
            employmentType: '',
          },
          {
            slug: '2026-Jun-04-rejected-co',
            status: 'rejected',
            title: 'Role',
            company: 'Rejected Co',
            site: '',
            location: '',
            targetRole: '',
            appliedOn: '2026-06-04',
            tags: [],
            employmentType: '',
          },
          {
            slug: '2026-Jun-05-withdrawn-co',
            status: 'withdrawn',
            title: 'Role',
            company: 'Withdrawn Co',
            site: '',
            location: '',
            targetRole: '',
            appliedOn: '2026-06-05',
            tags: [],
            employmentType: '',
          },
        ],
      });

      const {
        stderr: _stderr,
        exitCode,
        stdout,
      } = await runCommand(listCommand, ['list', '--campaign', 'default'], parentSetup);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('offer');
      expect(stdout).toContain('rejected');
      expect(stdout).toContain('withdrawn');
    });

    it('handles ListError from core', async () => {
      vi.mocked(listCoreModule.runListApplications).mockRejectedValue(
        new listCoreModule.ListError('campaign not found'),
      );

      const {
        stdout: _stdout,
        stderr,
        exitCode,
      } = await runCommand(listCommand, ['list', '--campaign', 'nonexistent'], parentSetup);
      expect(exitCode).toBe(1);
      expect(stderr).toContain('campaign not found');
    });

    it('re-throws unknown errors', async () => {
      vi.mocked(listCoreModule.runListApplications).mockRejectedValue(new Error('boom'));

      await expect(
        runCommand(listCommand, ['list', '--campaign', 'default'], parentSetup),
      ).rejects.toThrow('boom');
    });

    it('errors on invalid status', async () => {
      vi.mocked(listCoreModule.runListApplications).mockRejectedValue(
        new listCoreModule.InvalidListStatusError('flying'),
      );

      const {
        stdout: _stdout,
        stderr,
        exitCode,
      } = await runCommand(
        listCommand,
        ['list', '--campaign', 'default', '--status', 'flying'],
        parentSetup,
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain('error');
      expect(stderr).toContain('invalid status');
    });

    it('accepts any employment type (validation happens in core)', async () => {
      vi.mocked(listCoreModule.runListApplications).mockResolvedValue({
        entries: [
          {
            slug: '2026-Jun-01-SE-Acme-123',
            status: 'applied',
            title: 'Software Engineer',
            company: 'Acme Corp',
            site: 'Seek',
            location: 'Sydney NSW',
            targetRole: 'senior-backend-engineer',
            appliedOn: '2026-06-01',
            tags: ['typescript'],
            employmentType: 'permanent',
          },
        ],
      });

      const { stdout, exitCode } = await runCommand(
        listCommand,
        ['list', '--campaign', 'default', '--employment-type', 'any-value'],
        parentSetup,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Acme Corp');
    });

    it('filters by employment type', async () => {
      vi.mocked(listCoreModule.runListApplications).mockResolvedValue({
        entries: [
          {
            slug: '2026-Jun-01-SE-Acme-123',
            status: 'applied',
            title: 'Software Engineer',
            company: 'Acme Corp',
            site: 'Seek',
            location: 'Sydney NSW',
            targetRole: 'senior-backend-engineer',
            appliedOn: '2026-06-01',
            tags: ['typescript'],
            employmentType: 'permanent',
          },
        ],
      });

      const { stdout, exitCode } = await runCommand(
        listCommand,
        ['list', '--campaign', 'default', '--employment-type', 'permanent'],
        parentSetup,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Acme Corp');
    });
  });

  describe('cwd inference (inside campaign folder)', () => {
    let cwdSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      // Spy on process.cwd to return a path inside a campaign folder
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

      cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(campaignDir);

      vi.mocked(listCoreModule.runListApplications).mockResolvedValue({
        entries: [
          {
            slug: '2026-Jun-01-SE-Acme-123',
            status: 'applied',
            title: 'Software Engineer',
            company: 'Acme Corp',
            site: 'Seek',
            location: 'Sydney NSW',
            targetRole: 'senior-backend-engineer',
            appliedOn: '2026-06-01',
            tags: ['typescript'],
            employmentType: 'permanent',
          },
        ],
      });
    });

    afterEach(() => {
      cwdSpy.mockRestore();
    });

    it('lists applications when cwd is inside a campaign folder', async () => {
      const { stdout, exitCode } = await runCommand(listCommand, ['list']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Acme Corp');
      expect(stdout).toContain('Software Engineer');
      expect(stdout).toContain('1 application');
    });

    it('outputs application JSON with --json when cwd inside campaign', async () => {
      const { stdout, exitCode } = await runCommand(listCommand, ['list', '--json']);
      expect(exitCode).toBe(0);
      const appEntries = JSON.parse(stdout.trim());
      expect(appEntries).toHaveLength(1);
      expect(appEntries[0]!.company).toBe('Acme Corp');
    });

    it('respects --status filter alongside cwd inference', async () => {
      const { exitCode } = await runCommand(listCommand, ['list', '--status', 'applied']);
      expect(exitCode).toBe(0);
      expect(listCoreModule.runListApplications).toHaveBeenCalledWith(
        'default',
        expect.objectContaining({ status: 'applied' }),
      );
    });

    it('shows "No applications found." when campaign has no applications', async () => {
      vi.mocked(listCoreModule.runListApplications).mockResolvedValue({ entries: [] });
      const { stdout, exitCode } = await runCommand(listCommand, ['list']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No applications found.');
    });

    it('still respects explicit --campaign over cwd inference', async () => {
      vi.mocked(listCoreModule.runListApplications).mockResolvedValue({
        entries: [
          {
            slug: '2026-Jun-02-SE-Other-456',
            status: 'applied',
            title: 'Other Engineer',
            company: 'Other Corp',
            site: '',
            location: '',
            targetRole: '',
            appliedOn: '2026-06-02',
            tags: [],
            employmentType: '',
          },
        ],
      });

      const { stdout, exitCode } = await runCommand(
        listCommand,
        ['list', '--campaign', 'freelance'],
        parentSetup,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Other Corp');
      expect(listCoreModule.runListApplications).toHaveBeenCalledWith(
        'freelance',
        expect.anything(),
      );
    });
  });
});
