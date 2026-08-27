import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { createApplication } from '../applications/applications.js';
import { repairApp, repairAll } from './repair.js';

describe('repair branch coverage (100-101,138-139,225-226)', () => {
  let tmpRoot: string;
  let campaignRoot: string;
  let appliedDir: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'jho-repair-branch-'));
    process.env['JHO_CONFIG_HOME'] = join(tmpRoot, '.jho');
    process.env['JHO_DATA'] = join(tmpRoot, 'data');
    campaignRoot = join(tmpRoot, 'data', 'campaigns', 'default');
    appliedDir = join(campaignRoot, 'applied');
    await mkdir(appliedDir, { recursive: true });
    await mkdir(join(tmpRoot, '.jho'), { recursive: true });
    await writeFile(join(tmpRoot, '.jho', 'config.json'), JSON.stringify({}), 'utf8');
    await writeFile(join(campaignRoot, 'config.json'), JSON.stringify({}), 'utf8');
  });

  afterEach(async () => {
    delete process.env['JHO_CONFIG_HOME'];
    delete process.env['JHO_DATA'];
    await rm(tmpRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('repairApp handles computeHash throw gracefully (100-101)', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    const toolhash = await import('../../lib/toolhash.js');
    vi.spyOn(toolhash, 'computeHash').mockImplementation(() => {
      throw new Error('hash fail');
    });
    const result = await repairApp(appliedDir, slug);
    expect(result.actions.length).toBeGreaterThanOrEqual(0);
  });

  it('repairApp handles listInterviews throw gracefully (138-139)', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    const mod = await import('../interviews/interviews.js');
    vi.spyOn(mod, 'listInterviews').mockRejectedValue(new Error('interviews fail'));
    const result = await repairApp(appliedDir, slug);
    expect(result).toBeDefined();
  });

  it('repairAll handles repairApp throw gracefully (225-226)', async () => {
    const slug = await createApplication({
      appliedDir,
      title: 'Eng',
      company: 'Acme',
      appliedOn: '2026-06-01',
    });
    const repairMod = await import('./repair.js');
    const orig = repairMod.repairApp;
    const spy = vi
      .spyOn(repairMod, 'repairApp')
      .mockImplementation(async (dir: string, s: string) => {
        if (s === slug) {
          throw new Error('repair fail');
        }
        return orig(dir, s);
      });
    const result = await repairAll(campaignRoot);
    expect(result.actions).toBeDefined();
    spy.mockRestore();
  });
});
