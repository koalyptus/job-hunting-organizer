import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache } from '../../../core/config.js';
import { runCommand } from '../helpers.js';
import { doctorCommand } from '../../commands/doctor.js';
import * as doctorCore from '../../../core/doctor/index.js';
import { DoctorError } from '../../../core/doctor/index.js';
import type { DoctorIssue } from '../../../core/doctor/types.js';

vi.mock('../../../core/doctor/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof doctorCore>();
  return {
    ...actual,
    diagnoseCampaign: vi.fn(),
    diagnoseApp: vi.fn(),
  };
});

vi.mock('../../../core/spinner.js', () => ({
  withSpinner: vi.fn((_msg: string, _success: string, fn: () => Promise<unknown>) => fn()),
}));

describe('doctor command', () => {
  let testHome: string;
  let originalJhoConfigHome: string | undefined;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-doctor-'));
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

  describe('campaign-wide diagnosis', () => {
    it('shows healthy when no issues', async () => {
      vi.mocked(doctorCore.diagnoseCampaign).mockResolvedValue([]);

      const { stdout, exitCode } = await runCommand(doctorCommand, ['doctor']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('healthy');
    });

    it('shows issues when found', async () => {
      const issues: DoctorIssue[] = [
        {
          severity: 'warn',
          category: 'index',
          check: 'index_stale',
          message: 'Application folder not in index',
          slug: '2026-Jun-29-SE-Test-Corp',
          remediation: 'Run jho doctor --repair',
        },
      ];
      vi.mocked(doctorCore.diagnoseCampaign).mockResolvedValue(issues);

      const { stdout, exitCode } = await runCommand(doctorCommand, ['doctor']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('1 issue(s)');
      expect(stdout).toContain('index_stale');
      expect(stdout).toContain('WARN');
    });

    it('exits with error when DoctorError is thrown', async () => {
      vi.mocked(doctorCore.diagnoseCampaign).mockRejectedValue(
        new DoctorError('Campaign not found'),
      );

      const { stderr, exitCode } = await runCommand(doctorCommand, ['doctor']);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Campaign not found');
    });
  });

  describe('single app diagnosis', () => {
    it('shows healthy for app with no issues', async () => {
      vi.mocked(doctorCore.diagnoseApp).mockResolvedValue([]);

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stdout, exitCode } = await runCommand(doctorCommand, ['doctor', slug]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(slug);
      expect(stdout).toContain('healthy');
    });

    it('shows issues for app', async () => {
      const issues: DoctorIssue[] = [
        {
          severity: 'error',
          category: 'frontmatter',
          check: 'meta_missing',
          message: 'meta.md not found',
          slug: '2026-Jun-29-SE-Test-Corp',
          remediation: 'Re-track the application',
        },
      ];
      vi.mocked(doctorCore.diagnoseApp).mockResolvedValue(issues);

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stdout, exitCode } = await runCommand(doctorCommand, ['doctor', slug]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('1 issue(s)');
      expect(stdout).toContain('meta_missing');
      expect(stdout).toContain('ERROR');
    });
  });

  describe('help text', () => {
    it('contains examples', async () => {
      const helpOutput = doctorCommand.helpInformation();
      expect(helpOutput).not.toContain('--all');
      expect(helpOutput).toContain('Diagnose');
    });
  });
});
