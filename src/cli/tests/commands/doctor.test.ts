import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache } from '../../../core/config/config.js';
import { runCommand } from '../helpers.js';
import { doctorCommand } from '../../commands/doctor.js';
import * as doctorCore from '../../../core/doctor/index.js';
import { DoctorError } from '../../../core/doctor/index.js';
import type { DoctorIssue } from '../../../core/doctor/types.js';
import {
  BACKEND_NAME_OLLAMA,
  BACKEND_NAME_LMSTUDIO,
  DEFAULT_LLM_BASE_URL,
  DEFAULT_LLM_MODEL,
  DEFAULT_LMSTUDIO_BASE_URL,
} from '../../../workflow/init/constants.js';

vi.mock('detect-local-agents', () => ({
  detectAgents: vi.fn(),
}));

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
        llm: { baseUrl: DEFAULT_LLM_BASE_URL, apiKey: 'test-key', model: 'test-model' },
        github: { user: 'testuser', token: '', repos: [] },
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
          remediation: 'Run jho repair',
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

  describe('campaign-wide diagnosis edge cases', () => {
    it('campaign-picker respects silent logging from campaign config', async () => {
      const silentCampaignDir = join(testHome, 'data', 'campaigns', 'silent-campaign');
      await mkdir(silentCampaignDir, { recursive: true });
      await writeFile(
        join(silentCampaignDir, 'config.json'),
        JSON.stringify({
          version: 1,
          logging: { level: 'silent' },
        }),
      );

      vi.mocked(doctorCore.diagnoseCampaign).mockResolvedValue([]);

      const { stdout, exitCode } = await runCommand(doctorCommand, ['doctor'], (p) =>
        p.option('--campaign', 'silent-campaign'),
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain('healthy');
    });

    it('handles DoctorError with custom message', async () => {
      vi.mocked(doctorCore.diagnoseCampaign).mockRejectedValue(
        new DoctorError('Custom doctor error'),
      );

      const { stderr, exitCode } = await runCommand(doctorCommand, ['doctor']);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Custom doctor error');
    });

    it('handles DoctorError for unknown campaign passed via --campaign', async () => {
      vi.mocked(doctorCore.diagnoseCampaign).mockRejectedValue(
        new DoctorError('Unknown campaign "ghost-campaign"'),
      );

      const { stderr, exitCode } = await runCommand(doctorCommand, ['doctor'], (p) =>
        p.option('--campaign', 'ghost-campaign'),
      );

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Unknown campaign');
    });

    it('campaign diagnosis respects default campaign when --campaign flag omitted', async () => {
      vi.mocked(doctorCore.diagnoseCampaign).mockResolvedValue([
        {
          severity: 'info',
          category: 'config',
          check: 'campaign_loaded',
          message: 'Default campaign loaded successfully',
          slug: null,
          remediation: 'No action needed',
        },
      ]);

      const { stdout, exitCode } = await runCommand(doctorCommand, ['doctor']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('campaign_loaded');
    });

    it('renders unknown severity via severityIcon default', async () => {
      vi.mocked(doctorCore.diagnoseCampaign).mockResolvedValue([
        {
          severity: 'critical' as unknown as DoctorIssue['severity'],
          category: 'system' as unknown as DoctorIssue['category'],
          check: 'test_check',
          message: 'Something critical',
          slug: null,
          remediation: 'Take action',
        },
      ]);

      const { stdout, exitCode } = await runCommand(doctorCommand, ['doctor']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('CRITICAL');
    });
  });

  describe('help text', () => {
    it('contains examples', async () => {
      const helpOutput = doctorCommand.helpInformation();
      expect(helpOutput).not.toContain('--all');
      expect(helpOutput).toContain('Diagnose');
    });
  });

  describe('--detect-agents', () => {
    it('detects Ollama and shows suggested config without campaign selection', async () => {
      const { detectAgents } = await import('detect-local-agents');
      vi.mocked(detectAgents).mockResolvedValue([
        {
          name: BACKEND_NAME_OLLAMA,
          binary: 'ollama',
          version: '0.1.23',
          isConfigured: true,
          isACPAgent: false,
        },
      ] as never);

      const { stdout, exitCode } = await runCommand(doctorCommand, ['doctor', '--detect-agents']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(BACKEND_NAME_OLLAMA);
      expect(stdout).toContain(DEFAULT_LLM_BASE_URL);
      expect(stdout).toContain(DEFAULT_LLM_MODEL);
    });

    it('detects LM Studio and shows suggested config', async () => {
      const { detectAgents } = await import('detect-local-agents');
      vi.mocked(detectAgents).mockResolvedValue([
        {
          name: BACKEND_NAME_LMSTUDIO,
          binary: 'lms',
          version: '0.3.0',
          isConfigured: true,
          isACPAgent: false,
        },
      ] as never);

      const { stdout, exitCode } = await runCommand(doctorCommand, ['doctor', '--detect-agents']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain(BACKEND_NAME_LMSTUDIO);
      expect(stdout).toContain(DEFAULT_LMSTUDIO_BASE_URL);
    });

    it('shows install hint when no backends detected', async () => {
      const { detectAgents } = await import('detect-local-agents');
      vi.mocked(detectAgents).mockResolvedValue([] as never);

      const { stdout, exitCode } = await runCommand(doctorCommand, ['doctor', '--detect-agents']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('No local OpenAI-compatible backend detected');
      expect(stdout).toContain('ollama.com/install.sh');
    });

    it('exits with error when detection fails', async () => {
      const { detectAgents } = await import('detect-local-agents');
      vi.mocked(detectAgents).mockRejectedValue(new Error('Detection error'));

      const { exitCode } = await runCommand(doctorCommand, ['doctor', '--detect-agents']);

      expect(exitCode).toBe(1);
    });
  });
});
