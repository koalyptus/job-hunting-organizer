import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache } from '../config/config.js';
import { resolveOldName, renameCampaign, RenameError } from '../rename-campaign.js';

describe('resolveOldName', () => {
  let testHome: string;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-rename-resolve-'));
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

  it('returns trimmed --from flag when provided', () => {
    expect(resolveOldName('  my-campaign  ')).toBe('my-campaign');
  });

  it('returns --from flag as-is when no whitespace', () => {
    expect(resolveOldName('freelance')).toBe('freelance');
  });

  it('throws RenameError when --from is empty and cwd is not in a campaign', () => {
    expect(() => resolveOldName(undefined)).toThrow(RenameError);
  });
});

describe('renameCampaign', () => {
  let testHome: string;
  let originalJhoData: string | undefined;
  let dataRoot: string;

  beforeEach(async () => {
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-rename-campaign-'));
    dataRoot = join(testHome, 'data');
    process.env['JHO_DATA'] = dataRoot;
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

  async function createCampaign(name: string): Promise<string> {
    const dir = join(dataRoot, 'campaigns', name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'config.json'), '{}');
    return dir;
  }

  it('renames a campaign', async () => {
    await createCampaign('old-name');

    await renameCampaign('old-name', 'new-name');

    const campaigns = await readdir(join(dataRoot, 'campaigns'));
    expect(campaigns).toContain('new-name');
    expect(campaigns).not.toContain('old-name');
  });

  it('throws RenameError for invalid new name', async () => {
    await createCampaign('existing');

    await expect(renameCampaign('existing', '../evil')).rejects.toThrow(RenameError);
  });

  it('throws RenameError when source does not exist', async () => {
    await expect(renameCampaign('nonexistent', 'new-name')).rejects.toThrow(RenameError);
  });

  it('throws RenameError when destination already exists', async () => {
    await createCampaign('source');
    await createCampaign('dest');

    await expect(renameCampaign('source', 'dest')).rejects.toThrow(RenameError);
  });

  it('throws RenameError when cwd is inside the campaign being renamed', async () => {
    const campaignDir = await createCampaign('my-campaign');
    const subdir = join(campaignDir, 'subdir');
    await mkdir(subdir, { recursive: true });
    const originalCwd = process.cwd();
    vi.spyOn(process, 'cwd').mockReturnValue(subdir);

    try {
      await expect(renameCampaign('my-campaign', 'renamed')).rejects.toThrow(RenameError);
    } finally {
      vi.spyOn(process, 'cwd').mockReturnValue(originalCwd);
    }
  });
});
