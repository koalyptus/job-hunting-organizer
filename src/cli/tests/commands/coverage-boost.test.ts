/* eslint-disable @typescript-eslint/consistent-type-imports */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { clearConfigCache } from '../../../lib/config/config.js';
import { runCommand } from '../helpers.js';

import { coverLetterCommand } from '../../commands/cover-letter.js';
import { initCommand } from '../../commands/init.js';
import { repairCommand } from '../../commands/repair.js';
import { removeApplicationCommand } from '../../commands/remove-application.js';
import { removeCampaignCommand } from '../../commands/remove-campaign.js';
import { retroCommand } from '../../commands/retro.js';
import * as coverLetterWorkflow from '../../../workflow/applications/cover-letter.js';
import * as initWorkflow from '../../../workflow/init/index.js';
import * as repairWorkflow from '../../../workflow/repair/index.js';
import * as applicationsWorkflow from '../../../workflow/applications/index.js';
import * as removeCampaignWorkflow from '../../../workflow/campaign/remove-campaign.js';
import * as retroWorkflow from '../../../workflow/retro/index.js';
import * as retroErrors from '../../../workflow/retro/retro-errors.js';
import * as storageModule from '../../../storage/index.js';

vi.mock('../../../workflow/applications/cover-letter.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../workflow/applications/cover-letter.js')>();
  return { ...actual, generateCoverLetter: vi.fn(), readCoverLetter: vi.fn() };
});
vi.mock('../../../workflow/init/index.js', async () => ({ runInit: vi.fn() }));
vi.mock('../../../workflow/repair/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../workflow/repair/index.js')>();
  return { ...actual, repairApp: vi.fn(), repairAll: vi.fn() };
});
vi.mock('../../../workflow/applications/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../workflow/applications/index.js')>();
  return { ...actual, deleteApplication: vi.fn() };
});
vi.mock('../../../workflow/campaign/remove-campaign.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../workflow/campaign/remove-campaign.js')>();
  return {
    ...actual,
    resolveCampaignToRemove: vi.fn((x: string) => x ?? 'default'),
    removeCampaign: vi.fn(),
  };
});
vi.mock('../../../workflow/retro/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../workflow/retro/index.js')>();
  return {
    ...actual,
    startRetro: vi.fn(),
    appendRetro: vi.fn(),
    showRetro: vi.fn(),
    aggregateRetros: vi.fn(),
  };
});
vi.mock('../../../workflow/prepare/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../workflow/prepare/index.js')>();
  return { ...actual, prepare: vi.fn() };
});
vi.mock('../../../core/spinner.js', () => ({
  withSpinner: vi.fn((_m: string, _s: string, fn: () => Promise<unknown>) => fn()),
}));

describe('coverage boost - generic rethrows and edge branches', () => {
  let testHome: string;
  let origConfigHome: string | undefined;
  let origData: string | undefined;

  beforeEach(async () => {
    origConfigHome = process.env['JHO_CONFIG_HOME'];
    origData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-cov-boost-'));
    process.env['JHO_CONFIG_HOME'] = join(testHome, '.jho');
    process.env['JHO_DATA'] = join(testHome, 'data');
    clearConfigCache();
    await mkdir(join(testHome, '.jho'), { recursive: true });
    await writeFile(
      join(testHome, '.jho', 'config.json'),
      JSON.stringify({
        version: 1,
        dataRoot: join(testHome, 'data'),
        llm: { baseUrl: 'http://x', apiKey: 'k', model: 'm' },
        github: { user: '', token: '', repos: [] },
        logging: { level: 'silent', file: '', redactPaths: [] },
      }),
    );
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
    await writeFile(join(campaignDir, 'profile.md'), '# Profile\n');
  });

  afterEach(async () => {
    clearConfigCache();
    vi.restoreAllMocks();
    if (origConfigHome === undefined) {
      delete process.env['JHO_CONFIG_HOME'];
    } else {
      process.env['JHO_CONFIG_HOME'] = origConfigHome;
    }
    if (origData === undefined) {
      delete process.env['JHO_DATA'];
    } else {
      process.env['JHO_DATA'] = origData;
    }
    await rm(testHome, { recursive: true, force: true });
  });

  it('cover-letter generic throw is rethrown (134-135)', async () => {
    vi.mocked(coverLetterWorkflow.generateCoverLetter).mockRejectedValue(
      new Error('generic cover'),
    );
    const slug = '2026-Jun-29-SE-Test-Corp';
    const campaignDir = join(testHome, 'data', 'campaigns', 'default');
    await mkdir(join(campaignDir, 'applied', slug), { recursive: true });
    await expect(runCommand(coverLetterCommand, ['cover-letter', slug])).rejects.toThrow(
      'generic cover',
    );
  });

  it('init generic throw is rethrown (54-55)', async () => {
    vi.mocked(initWorkflow.runInit).mockRejectedValue(new Error('generic init'));
    await expect(runCommand(initCommand, ['init', 'default'])).rejects.toThrow('generic init');
  });

  it('repair generic throw is rethrown (109-110)', async () => {
    vi.mocked(repairWorkflow.repairAll).mockRejectedValue(new Error('generic repair'));
    await expect(runCommand(repairCommand, ['repair'])).rejects.toThrow('generic repair');
  });

  it('retro show generic throw rethrown (79-80)', async () => {
    vi.mocked(retroWorkflow.showRetro).mockRejectedValue(new Error('generic show'));
    const slug = '2026-Jun-29-SE-Test-Corp';
    const campaignDir = join(testHome, 'data', 'campaigns', 'default');
    await mkdir(join(campaignDir, 'applied', slug), { recursive: true });
    await expect(runCommand(retroCommand, ['retro', 'show', slug])).rejects.toThrow('generic show');
  });

  it('retro show handles SlugMissingError (60-66)', async () => {
    const { stderr, exitCode } = await runCommand(retroCommand, ['retro', 'show']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('missing <slug> argument');
  });

  it('retro show handles RetroNotFoundError (67-72)', async () => {
    vi.mocked(retroWorkflow.showRetro).mockRejectedValue(
      new retroErrors.RetroNotFoundError('not found'),
    );
    const slug = '2026-Jun-29-SE-Test-Corp';
    const campaignDir = join(testHome, 'data', 'campaigns', 'default');
    await mkdir(join(campaignDir, 'applied', slug), { recursive: true });
    const { stderr, exitCode } = await runCommand(retroCommand, ['retro', 'show', slug]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not found');
  });

  it('retro aggregate generic throw rethrown (246-247)', async () => {
    vi.mocked(retroWorkflow.aggregateRetros).mockRejectedValue(new Error('generic agg'));
    await expect(runCommand(retroCommand, ['retro', 'aggregate'])).rejects.toThrow('generic agg');
  });

  it('retro main empty weakTopics exits 1 (300-302)', async () => {
    // Trigger via --weak-topics with empty after split
    const slug = '2026-Jun-29-SE-Test-Corp';
    const campaignDir = join(testHome, 'data', 'campaigns', 'default');
    await mkdir(join(campaignDir, 'applied', slug), { recursive: true });
    const { stderr, exitCode } = await runCommand(retroCommand, [
      'retro',
      slug,
      '--weak-topics',
      ' , , ',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('at least one weak topic');
  });

  it('retro append empty weakTopics exits 1 (121-123)', async () => {
    const slug = '2026-Jun-29-SE-Test-Corp';
    const campaignDir = join(testHome, 'data', 'campaigns', 'default');
    await mkdir(join(campaignDir, 'applied', slug), { recursive: true });
    const { stderr, exitCode } = await runCommand(retroCommand, [
      'retro',
      '--weak-topics',
      ' ,  ',
      'append',
      slug,
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('at least one weak topic');
  });

  it('remove-application handles generic throw after isCancel branches (27-28)', async () => {
    // Test the confirmRemoval branches via removeApplication without --yes
    // We mock deleteApplication to throw generic after confirm

    vi.spyOn(storageModule, 'createStore').mockReturnValue({ exists: async () => true } as never);

    vi.mocked(applicationsWorkflow.deleteApplication).mockRejectedValue(new Error('generic del'));

    const slug = '2026-Jun-29-SE-Test-Corp';
    const campaignDir = join(testHome, 'data', 'campaigns', 'default');
    await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

    // Use --yes to skip confirm, so the generic throw path is hit (78-79)
    await expect(
      runCommand(removeApplicationCommand, ['remove-application', slug, '--yes']),
    ).rejects.toThrow('generic del');
  });

  it('remove-campaign handles generic throw (covers 39-40)', async () => {
    vi.mocked(removeCampaignWorkflow.removeCampaign).mockRejectedValue(new Error('generic rc'));
    await expect(
      runCommand(removeCampaignCommand, ['remove-campaign', 'test', '--yes']),
    ).rejects.toThrow('generic rc');
  });
});
