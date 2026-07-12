import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { Option, type Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as clack from '@clack/prompts';
import { runCommand } from './helpers.js';
import { doctorCommand } from '../commands/doctor.js';
import * as doctorCore from '../../core/doctor/index.js';
import * as pathsModule from '../../core/paths.js';
import { resolveCampaign } from '../campaign.js';
import * as campaignCore from '../../core/campaign/index.js';
import { CampaignPickerCancelled } from '../../core/campaign/index.js';

vi.mock('@clack/prompts', () => ({
  select: vi.fn(),
  isCancel: vi.fn(() => false),
  log: { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../core/doctor/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof doctorCore>();
  return {
    ...actual,
    diagnoseCampaign: vi.fn(),
  };
});

vi.mock('../../core/paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof pathsModule>();
  return {
    ...actual,
    listCampaigns: vi.fn(),
  };
});

vi.mock('../../../core/spinner.js', () => ({
  withSpinner: vi.fn((_msg: string, _success: string, fn: () => Promise<unknown>) => fn()),
}));

describe('doctor command — interactive campaign picker', () => {
  let testHome: string;
  let originalJhoConfigHome: string | undefined;
  let originalJhoData: string | undefined;
  let originalIsTty: boolean | undefined;

  beforeEach(async () => {
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoData = process.env['JHO_DATA'];
    originalIsTty = process.stdin.isTTY;
    testHome = await mkdtemp(join(tmpdir(), 'jho-picker-'));
    process.env['JHO_CONFIG_HOME'] = join(testHome, '.jho');
    process.env['JHO_DATA'] = join(testHome, 'data');
    // Simulate an interactive terminal.
    originalIsTty = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });

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
    const campaignDir = join(testHome, 'data', 'campaigns', 'default');
    await mkdir(campaignDir, { recursive: true });
  });

  afterEach(async () => {
    process.env['JHO_CONFIG_HOME'] = originalJhoConfigHome;
    process.env['JHO_DATA'] = originalJhoData;
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTty,
      configurable: true,
    });
    await rm(testHome, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  function withCampaignFlag(parent: Command): void {
    parent.addOption(new Option('--campaign <name>', 'campaign'));
  }

  it('prompts the user to pick when multiple campaigns exist (no --campaign)', async () => {
    vi.mocked(pathsModule.listCampaigns).mockResolvedValue([
      { name: 'default', applicationCount: 1 },
      { name: 'freelance', applicationCount: 2 },
    ]);
    vi.mocked(clack.select).mockResolvedValue('freelance');
    vi.mocked(doctorCore.diagnoseCampaign).mockResolvedValue([]);

    const { stdout, exitCode } = await runCommand(doctorCommand, ['doctor'], withCampaignFlag);

    expect(exitCode).toBe(0);
    expect(clack.select).toHaveBeenCalledOnce();
    expect(stdout).toContain('Campaign: freelance');
  });

  it('does not prompt when --campaign is given', async () => {
    vi.mocked(pathsModule.listCampaigns).mockResolvedValue([
      { name: 'default', applicationCount: 1 },
      { name: 'freelance', applicationCount: 2 },
    ]);
    vi.mocked(doctorCore.diagnoseCampaign).mockResolvedValue([]);

    const { exitCode } = await runCommand(
      doctorCommand,
      ['doctor', '--campaign', 'default'],
      withCampaignFlag,
    );

    expect(exitCode).toBe(0);
    expect(clack.select).not.toHaveBeenCalled();
  });

  it('exits 0 when the picker is cancelled', async () => {
    vi.mocked(pathsModule.listCampaigns).mockResolvedValue([
      { name: 'default', applicationCount: 1 },
      { name: 'freelance', applicationCount: 2 },
    ]);
    vi.mocked(clack.select).mockResolvedValue('x');
    vi.mocked(clack.isCancel).mockReturnValue(true);

    const { exitCode } = await runCommand(doctorCommand, ['doctor'], withCampaignFlag);

    expect(exitCode).toBe(0);
  });
});

describe('resolveCampaign', () => {
  it('returns the campaign from resolveCampaignInteractive', async () => {
    const spy = vi.spyOn(campaignCore, 'resolveCampaignInteractive').mockResolvedValue('freelance');

    const result = await resolveCampaign({ campaign: 'freelance' });
    expect(result).toBe('freelance');
    expect(spy).toHaveBeenCalledWith('freelance', { yes: undefined });
  });

  it('passes undefined campaign and yes flag', async () => {
    const spy = vi.spyOn(campaignCore, 'resolveCampaignInteractive').mockResolvedValue('default');

    const result = await resolveCampaign({ yes: true });
    expect(result).toBe('default');
    expect(spy).toHaveBeenCalledWith(undefined, { yes: true });
  });

  it('calls process.exit(0) when picker is cancelled', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    vi.spyOn(campaignCore, 'resolveCampaignInteractive').mockRejectedValue(
      new CampaignPickerCancelled(),
    );

    await expect(resolveCampaign({})).rejects.toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });

  it('re-throws non-cancellation errors', async () => {
    vi.spyOn(campaignCore, 'resolveCampaignInteractive').mockRejectedValue(
      new Error('disk failure'),
    );

    await expect(resolveCampaign({})).rejects.toThrow('disk failure');
  });
});
