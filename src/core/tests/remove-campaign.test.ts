import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile, readdir, readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache } from '../config/config.js';
import {
  resolveCampaignToRemove,
  removeCampaign,
  RemoveCampaignError,
  RemoveCancelled,
} from '../remove-campaign.js';
import type * as ClackPrompts from '@clack/prompts';
import { confirm } from '@clack/prompts';

vi.mock('@clack/prompts', async (importOriginal) => {
  const actual = await importOriginal<typeof ClackPrompts>();
  return {
    ...actual,
    confirm: vi.fn(),
    isCancel: actual.isCancel,
    log: actual.log,
  };
});

const mockedConfirm = vi.mocked(confirm);

describe('resolveCampaignToRemove', () => {
  let testHome: string;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-rm-resolve-'));
    process.env['JHO_DATA'] = join(testHome, 'data');
    clearConfigCache();
  });

  afterEach(async () => {
    clearConfigCache();
    if (originalJhoData === undefined) {
      delete process.env['JHO_DATA'];
    } else {
      process.env['JHO_DATA'] = originalJhoData;
    }
    await rm(testHome, { recursive: true, force: true });
  });

  it('returns trimmed explicit name when provided', () => {
    expect(resolveCampaignToRemove('  freelance  ')).toBe('freelance');
  });

  it('throws when name is empty and cwd is not in a campaign', () => {
    expect(() => resolveCampaignToRemove(undefined)).toThrow(RemoveCampaignError);
  });
});

describe('removeCampaign', () => {
  let testHome: string;
  let originalJhoData: string | undefined;
  let dataRoot: string;

  beforeEach(async () => {
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-rm-campaign-'));
    dataRoot = join(testHome, 'data');
    process.env['JHO_DATA'] = dataRoot;
    clearConfigCache();
    mockedConfirm.mockResolvedValue(true);
  });

  afterEach(async () => {
    clearConfigCache();
    if (originalJhoData === undefined) {
      delete process.env['JHO_DATA'];
    } else {
      process.env['JHO_DATA'] = originalJhoData;
    }
    await rm(testHome, { recursive: true, force: true });
  });

  async function createCampaign(name: string): Promise<string> {
    const dir = join(dataRoot, 'campaigns', name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'config.json'), '{}');
    await writeFile(join(dir, 'profile.md'), '# Profile\n');
    return dir;
  }

  it('removes a campaign when confirmed', async () => {
    await createCampaign('old-campaign');
    mockedConfirm.mockResolvedValue(true);

    await removeCampaign('old-campaign');

    const campaigns = await readdir(join(dataRoot, 'campaigns'));
    expect(campaigns).not.toContain('old-campaign');
  });

  it('skips the prompt and removes with skipConfirm', async () => {
    await createCampaign('old-campaign');
    mockedConfirm.mockClear();

    await removeCampaign('old-campaign', { skipConfirm: true });

    const campaigns = await readdir(join(dataRoot, 'campaigns'));
    expect(campaigns).not.toContain('old-campaign');
    expect(mockedConfirm).not.toHaveBeenCalled();
  });

  it('throws RemoveCancelled when the user declines', async () => {
    await createCampaign('old-campaign');
    mockedConfirm.mockResolvedValue(false);

    await expect(removeCampaign('old-campaign')).rejects.toThrow(RemoveCancelled);

    const campaigns = await readdir(join(dataRoot, 'campaigns'));
    expect(campaigns).toContain('old-campaign');
  });

  it('throws RemoveCampaignError when campaign does not exist', async () => {
    mockedConfirm.mockResolvedValue(true);

    await expect(removeCampaign('nonexistent')).rejects.toThrow(RemoveCampaignError);
  });

  it('throws RemoveCampaignError for invalid name', async () => {
    mockedConfirm.mockResolvedValue(true);

    await expect(removeCampaign('../evil')).rejects.toThrow(RemoveCampaignError);
  });

  it('throws when cwd is inside the campaign being removed', async () => {
    const campaignDir = await createCampaign('my-campaign');
    const subdir = join(campaignDir, 'subdir');
    await mkdir(subdir, { recursive: true });
    const originalCwd = process.cwd();
    vi.spyOn(process, 'cwd').mockReturnValue(subdir);

    try {
      await expect(removeCampaign('my-campaign')).rejects.toThrow(RemoveCampaignError);
    } finally {
      vi.spyOn(process, 'cwd').mockReturnValue(originalCwd);
    }
  });

  it('resolves the campaign name from cwd', async () => {
    const campaignDir = await createCampaign('inferred');
    const subdir = join(campaignDir, 'applied');
    await mkdir(subdir, { recursive: true });
    const originalCwd = process.cwd();
    vi.spyOn(process, 'cwd').mockReturnValue(subdir);

    try {
      expect(resolveCampaignToRemove(undefined)).toBe('inferred');
    } finally {
      vi.spyOn(process, 'cwd').mockReturnValue(originalCwd);
    }
  });

  it('deletes nested application data', async () => {
    const dir = await createCampaign('with-apps');
    await mkdir(join(dir, 'applied', '2026-Jan-01-dev-acme'), { recursive: true });
    await writeFile(join(dir, 'applied', '2026-Jan-01-dev-acme', 'meta.md'), '# App\n');
    mockedConfirm.mockResolvedValue(true);

    await removeCampaign('with-apps');

    await expect(readFile(join(dir, 'profile.md'), 'utf8')).rejects.toThrow();
  });
});
