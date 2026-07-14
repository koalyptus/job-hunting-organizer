import { Option, type Command } from 'commander';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCommand } from '../helpers.js';
import { statsCommand } from '../../commands/stats.js';
import * as statsCoreModule from '../../../core/stats/index.js';
import * as pathsModule from '../../../core/paths.js';
import type { CampaignStats } from '../../../core/types.js';

function parentSetup(parent: Command): void {
  parent.addOption(new Option('--campaign <name>', 'campaign to operate on'));
}

vi.mock('../../../core/stats/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof statsCoreModule>();
  return {
    ...actual,
    computeStats: vi.fn(),
  };
});

vi.mock('../../../core/paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof pathsModule>();
  return {
    ...actual,
    listCampaigns: vi.fn(),
  };
});

const emptyStats: CampaignStats = {
  total: 0,
  byStatus: {
    applied: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
    withdrawn: 0,
    abandoned: 0,
    ghosted: 0,
    accepted: 0,
  },
  byRole: {},
  bySite: {},
  byEmploymentType: {},
  funnel: { applied: 0, interview: 0, offer: 0, accepted: 0 },
  thisMonth: { applied: 0, rejected: 0, offer: 0, withdrawn: 0 },
};

const sampleStats: CampaignStats = {
  total: 5,
  byStatus: {
    applied: 2,
    interview: 1,
    offer: 1,
    rejected: 1,
    withdrawn: 0,
    abandoned: 0,
    ghosted: 0,
    accepted: 0,
  },
  byRole: { 'senior-backend': 3, '': 2 },
  bySite: { Seek: 3, LinkedIn: 2 },
  byEmploymentType: { permanent: 3, contract: 2 },
  funnel: { applied: 2, interview: 1, offer: 1, accepted: 0 },
  thisMonth: { applied: 1, rejected: 0, offer: 1, withdrawn: 0 },
  since: '2026-06-01',
};

const singleAppStats: CampaignStats = {
  total: 1,
  byStatus: {
    applied: 1,
    interview: 0,
    offer: 0,
    rejected: 0,
    withdrawn: 0,
    abandoned: 0,
    ghosted: 0,
    accepted: 0,
  },
  byRole: { 'backend-dev': 1 },
  bySite: { Seek: 1 },
  byEmploymentType: { permanent: 1 },
  funnel: { applied: 1, interview: 0, offer: 0, accepted: 0 },
  thisMonth: { applied: 0, rejected: 0, offer: 0, withdrawn: 0 },
};

const allStatusesStats: CampaignStats = {
  total: 8,
  byStatus: {
    applied: 1,
    interview: 1,
    offer: 1,
    rejected: 1,
    withdrawn: 1,
    abandoned: 1,
    ghosted: 1,
    accepted: 1,
  },
  byRole: { '': 5, backend: 3 },
  bySite: { '': 4, Seek: 4 },
  byEmploymentType: { permanent: 4, contract: 2, 'part-time': 2 },
  funnel: { applied: 1, interview: 1, offer: 0, accepted: 1 },
  thisMonth: { applied: 0, rejected: 1, offer: 0, withdrawn: 1 },
};

const noSinceStats: CampaignStats = {
  total: 3,
  byStatus: {
    applied: 3,
    interview: 0,
    offer: 0,
    rejected: 0,
    withdrawn: 0,
    abandoned: 0,
    ghosted: 0,
    accepted: 0,
  },
  byRole: {},
  bySite: {},
  byEmploymentType: {},
  funnel: { applied: 3, interview: 0, offer: 0, accepted: 0 },
  thisMonth: { applied: 0, rejected: 0, offer: 0, withdrawn: 0 },
};

describe('stats command', () => {
  let testHome: string;

  beforeEach(async () => {
    testHome = await mkdtemp(join(tmpdir(), 'jho-stats-'));
    process.env['JHO_CONFIG_HOME'] = join(testHome, '.jho');
    process.env['JHO_DATA'] = join(testHome, 'data');

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

  describe('single campaign mode (with --campaign)', () => {
    it('outputs JSON with --json', async () => {
      vi.mocked(statsCoreModule.computeStats).mockResolvedValue(sampleStats);

      const {
        stderr: _stderr,
        exitCode,
        stdout,
      } = await runCommand(statsCommand, ['stats', '--campaign', 'default', '--json'], parentSetup);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.total).toBe(5);
      expect(parsed.funnel.applied).toBe(2);
      expect(parsed.since).toBe('2026-06-01');
    });

    it('renders pretty output with all sections', async () => {
      vi.mocked(statsCoreModule.computeStats).mockResolvedValue(sampleStats);

      const {
        stderr: _stderr,
        exitCode,
        stdout,
      } = await runCommand(statsCommand, ['stats', '--campaign', 'default'], parentSetup);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Campaign:');
      expect(stdout).toContain('5 applications');
      expect(stdout).toContain('By status:');
      expect(stdout).toContain('By target role:');
      expect(stdout).toContain('By site:');
      expect(stdout).toContain('Funnel');
      expect(stdout).toContain('applied');
      expect(stdout).toContain('interview');
      expect(stdout).toContain('offer');
    });

    it('shows "No applications found." when total is 0', async () => {
      vi.mocked(statsCoreModule.computeStats).mockResolvedValue(emptyStats);

      const {
        stderr: _stderr,
        exitCode,
        stdout,
      } = await runCommand(statsCommand, ['stats', '--campaign', 'default'], parentSetup);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No applications found.');
    });

    it('handles InvalidSinceError with hint', async () => {
      vi.mocked(statsCoreModule.computeStats).mockRejectedValue(
        new statsCoreModule.InvalidSinceError('bad'),
      );

      const {
        stdout: _stdout,
        stderr,
        exitCode,
      } = await runCommand(
        statsCommand,
        ['stats', '--campaign', 'default', '--since', 'bad'],
        parentSetup,
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain('invalid --since value');
      expect(stderr).toContain('hint');
    });

    it('handles StatsError', async () => {
      vi.mocked(statsCoreModule.computeStats).mockRejectedValue(
        new statsCoreModule.StatsError('something went wrong'),
      );

      const {
        stdout: _stdout,
        stderr,
        exitCode,
      } = await runCommand(statsCommand, ['stats', '--campaign', 'default'], parentSetup);
      expect(exitCode).toBe(1);
      expect(stderr).toContain('something went wrong');
    });

    it('re-throws unknown errors', async () => {
      vi.mocked(statsCoreModule.computeStats).mockRejectedValue(new Error('boom'));

      await expect(
        runCommand(statsCommand, ['stats', '--campaign', 'default'], parentSetup),
      ).rejects.toThrow('boom');
    });

    it('renders singular "application" when total is 1', async () => {
      vi.mocked(statsCoreModule.computeStats).mockResolvedValue(singleAppStats);

      const { exitCode, stdout } = await runCommand(
        statsCommand,
        ['stats', '--campaign', 'default'],
        parentSetup,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('1 application)');
      expect(stdout).not.toContain('1 applications');
    });

    it('renders all status color branches', async () => {
      vi.mocked(statsCoreModule.computeStats).mockResolvedValue(allStatusesStats);

      const { exitCode, stdout } = await runCommand(
        statsCommand,
        ['stats', '--campaign', 'default'],
        parentSetup,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('applied');
      expect(stdout).toContain('interview');
      expect(stdout).toContain('offer');
      expect(stdout).toContain('rejected');
      expect(stdout).toContain('withdrawn');
      expect(stdout).toContain('abandoned');
      expect(stdout).toContain('ghosted');
      expect(stdout).toContain('accepted');
    });

    it('renders this-month rejected and withdrawn deltas', async () => {
      vi.mocked(statsCoreModule.computeStats).mockResolvedValue(allStatusesStats);

      const { exitCode, stdout } = await runCommand(
        statsCommand,
        ['stats', '--campaign', 'default'],
        parentSetup,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('This month');
      expect(stdout).toContain('-1 rejection');
      expect(stdout).toContain('-1 withdrawn');
    });

    it('renders no this-month block when all deltas are zero', async () => {
      vi.mocked(statsCoreModule.computeStats).mockResolvedValue(noSinceStats);

      const { exitCode, stdout } = await runCommand(
        statsCommand,
        ['stats', '--campaign', 'default'],
        parentSetup,
      );
      expect(exitCode).toBe(0);
      expect(stdout).not.toContain('This month');
    });

    it('renders "(unassigned)" for empty target role', async () => {
      vi.mocked(statsCoreModule.computeStats).mockResolvedValue(allStatusesStats);

      const { exitCode, stdout } = await runCommand(
        statsCommand,
        ['stats', '--campaign', 'default'],
        parentSetup,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('(unassigned)');
    });

    it('renders "(unknown)" for empty site', async () => {
      vi.mocked(statsCoreModule.computeStats).mockResolvedValue(allStatusesStats);

      const { exitCode, stdout } = await runCommand(
        statsCommand,
        ['stats', '--campaign', 'default'],
        parentSetup,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('(unknown)');
    });

    it('omits "since" label when stats.since is undefined', async () => {
      vi.mocked(statsCoreModule.computeStats).mockResolvedValue(noSinceStats);

      const { exitCode, stdout } = await runCommand(
        statsCommand,
        ['stats', '--campaign', 'default'],
        parentSetup,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('3 applications');
      expect(stdout).not.toContain('since');
    });

    it('omits empty role/site sections', async () => {
      vi.mocked(statsCoreModule.computeStats).mockResolvedValue(noSinceStats);

      const { exitCode, stdout } = await runCommand(
        statsCommand,
        ['stats', '--campaign', 'default'],
        parentSetup,
      );
      expect(exitCode).toBe(0);
      // byRole is empty — no "(unassigned)" line
      expect(stdout).not.toContain('(unassigned)');
      // bySite is empty — no "(unknown)" line
      expect(stdout).not.toContain('(unknown)');
    });

    it('singular thisMonth counts (1 application, 1 rejection, 1 offer, 1 withdrawn)', async () => {
      const singularMonthStats: CampaignStats = {
        ...emptyStats,
        total: 4,
        byStatus: { ...emptyStats.byStatus, applied: 1, rejected: 1, offer: 1, withdrawn: 1 },
        thisMonth: { applied: 1, rejected: 1, offer: 1, withdrawn: 1 },
      };
      vi.mocked(statsCoreModule.computeStats).mockResolvedValue(singularMonthStats);

      const { exitCode, stdout } = await runCommand(
        statsCommand,
        ['stats', '--campaign', 'default'],
        parentSetup,
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain('+1 application');
      expect(stdout).not.toContain('+1 applications');
      expect(stdout).toContain('-1 rejection');
      expect(stdout).not.toContain('-1 rejections');
      expect(stdout).toContain('+1 offer');
      expect(stdout).not.toContain('+1 offers');
      expect(stdout).toContain('-1 withdrawn');
    });

    it('passes --role and --since to computeStats in single-campaign mode', async () => {
      vi.mocked(statsCoreModule.computeStats).mockResolvedValue(sampleStats);

      await runCommand(
        statsCommand,
        ['stats', '--campaign', 'default', '--role', 'backend', '--since', '30d'],
        parentSetup,
      );

      expect(statsCoreModule.computeStats).toHaveBeenCalledWith(expect.any(String), {
        targetRole: 'backend',
        since: '30d',
      });
    });

    it('passes --employment-type to computeStats in single-campaign mode', async () => {
      vi.mocked(statsCoreModule.computeStats).mockResolvedValue(sampleStats);

      await runCommand(
        statsCommand,
        ['stats', '--campaign', 'default', '--employment-type', 'permanent'],
        parentSetup,
      );

      expect(statsCoreModule.computeStats).toHaveBeenCalledWith(expect.any(String), {
        employmentType: 'permanent',
      });
    });

    it('passes --employment-type to computeStats in multi-campaign mode', async () => {
      vi.mocked(pathsModule.listCampaigns).mockResolvedValue([
        { name: 'default', applicationCount: 5 },
      ]);
      vi.mocked(statsCoreModule.computeStats).mockResolvedValue(sampleStats);

      await runCommand(statsCommand, ['stats', '--employment-type', 'contract'], parentSetup);

      expect(statsCoreModule.computeStats).toHaveBeenCalledWith(expect.any(String), {
        employmentType: 'contract',
      });
    });

    it('errors on invalid employment type', async () => {
      const { exitCode, stderr } = await runCommand(
        statsCommand,
        ['stats', '--campaign', 'default', '--employment-type', 'invalid-type'],
        parentSetup,
      );
      expect(exitCode).toBe(1);
      expect(stderr).toContain('error');
      expect(stderr).toContain('invalid employment type');
    });
  });

  describe('multi-campaign mode (no --campaign)', () => {
    beforeEach(async () => {
      // Create campaign directories so listCampaigns finds them
      const campaignsRoot = join(testHome, 'data', 'campaigns');
      await mkdir(join(campaignsRoot, 'default', 'applied'), { recursive: true });
      await mkdir(join(campaignsRoot, 'freelance', 'applied'), { recursive: true });

      vi.mocked(pathsModule.listCampaigns).mockResolvedValue([
        { name: 'default', applicationCount: 5 },
        { name: 'freelance', applicationCount: 2 },
      ]);
    });

    it('shows summary for each campaign', async () => {
      vi.mocked(statsCoreModule.computeStats)
        .mockResolvedValueOnce({ ...sampleStats, total: 5 })
        .mockResolvedValueOnce({ ...sampleStats, total: 2, since: '2026-06-10' });

      const {
        stderr: _stderr,
        exitCode,
        stdout,
      } = await runCommand(statsCommand, ['stats'], parentSetup);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Campaign stats:');
      expect(stdout).toContain('default');
      expect(stdout).toContain('freelance');
      expect(stdout).toContain('5 applications');
      expect(stdout).toContain('2 applications');
      expect(stdout).toContain('applied');
      expect(stdout).toContain('interview');
    });

    it('outputs JSON array with --json', async () => {
      vi.mocked(statsCoreModule.computeStats)
        .mockResolvedValueOnce({ ...sampleStats, total: 5 })
        .mockResolvedValueOnce({ ...sampleStats, total: 2 });

      const {
        stderr: _stderr,
        exitCode,
        stdout,
      } = await runCommand(statsCommand, ['stats', '--json'], parentSetup);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout.trim());
      expect(parsed).toHaveLength(2);
      expect(parsed[0]!.name).toBe('default');
      expect(parsed[0]!.stats.total).toBe(5);
      expect(parsed[1]!.name).toBe('freelance');
      expect(parsed[1]!.stats.total).toBe(2);
    });

    it('shows "No campaigns found." when empty', async () => {
      vi.mocked(pathsModule.listCampaigns).mockResolvedValue([]);

      const {
        stderr: _stderr,
        exitCode,
        stdout,
      } = await runCommand(statsCommand, ['stats'], parentSetup);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No campaigns found.');
    });

    it('passes --role and --since filters to each campaign', async () => {
      vi.mocked(statsCoreModule.computeStats).mockResolvedValue(sampleStats);

      await runCommand(statsCommand, ['stats', '--role', 'backend', '--since', '30d'], parentSetup);

      expect(statsCoreModule.computeStats).toHaveBeenCalledWith(expect.any(String), {
        targetRole: 'backend',
        since: '30d',
      });
    });
  });

  it('help text contains examples', async () => {
    const helpOutput = statsCommand.helpInformation();
    expect(helpOutput).toContain('--role');
    expect(helpOutput).toContain('--since');
    expect(helpOutput).toContain('--json');
    expect(helpOutput).toContain('campaign snapshot');
  });
});
