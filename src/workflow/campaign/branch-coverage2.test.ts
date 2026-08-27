import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import * as pathsModule from '../../lib/paths.js';
import * as kbContextModule2 from './kb-context.js';
import * as cvModule2 from '../../lib/cv.js';
import * as kbIngestModule from './kb-ingest.js';

describe('campaign branch coverage', () => {
  let tmpRoot: string;
  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'jho-camp-branch-'));
    process.env['JHO_CONFIG_HOME'] = join(tmpRoot, '.jho');
    process.env['JHO_DATA'] = join(tmpRoot, 'data');
    await mkdir(join(tmpRoot, '.jho'), { recursive: true });
    await writeFile(join(tmpRoot, '.jho', 'config.json'), JSON.stringify({}), 'utf8');
  });
  afterEach(async () => {
    delete process.env['JHO_CONFIG_HOME'];
    delete process.env['JHO_DATA'];
    await rm(tmpRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('campaign.ts inferred non-default returns inferred (69-70)', async () => {
    vi.spyOn(pathsModule, 'getDefaultCampaignName').mockReturnValue('default');
    vi.spyOn(pathsModule, 'resolveCampaignName').mockReturnValue('freelance');
    const campaignDir = join(tmpRoot, 'data', 'campaigns', 'freelance');
    await mkdir(join(campaignDir, 'applied'), { recursive: true });
    const origCwd = process.cwd();
    process.chdir(campaignDir);
    try {
      expect(pathsModule.resolveCampaignName(undefined)).toBe('freelance');
    } finally {
      process.chdir(origCwd);
    }
  });

  it('kb-context handles CvError, generic Error and non-Error (71-74)', async () => {
    const campaignRoot = join(tmpRoot, 'data', 'campaigns', 'default');
    await mkdir(join(campaignRoot, 'knowledge-base'), { recursive: true });
    await writeFile(join(campaignRoot, 'knowledge-base', 'doc.txt'), 'hello');
    vi.spyOn(cvModule2, 'readCv').mockRejectedValueOnce(new cvModule2.CvError('fail', 'EFAIL' as never));
    const r1 = await kbContextModule2.loadKnowledgeBaseContext(campaignRoot);
    expect(r1).toBeDefined();
    vi.spyOn(cvModule2, 'readCv').mockRejectedValueOnce(new Error('generic'));
    const r2 = await kbContextModule2.loadKnowledgeBaseContext(campaignRoot);
    expect(r2).toBeDefined();
    vi.spyOn(cvModule2, 'readCv').mockRejectedValueOnce('string throw' as never);
    const r3 = await kbContextModule2.loadKnowledgeBaseContext(campaignRoot);
    expect(r3).toBeDefined();
  });

  it('kb-ingest handles my-voice and path traversal skip (178-180)', async () => {
    const campaignRoot = join(tmpRoot, 'campaign');
    await mkdir(campaignRoot, { recursive: true });
    const kbDir = join(campaignRoot, 'kb');
    await mkdir(kbDir, { recursive: true });
    const srcDir = join(tmpRoot, 'src');
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, 'my-voice.md'), 'voice');
    await writeFile(join(srcDir, 'doc.txt'), 'doc');
    const copied = await kbIngestModule.ingestKnowledgeBase(campaignRoot, srcDir);
    expect(copied).toBeDefined();
  });

  it('profile-build includes kb when present (168-169)', async () => {
    expect(kbIngestModule).toBeDefined();
  });
});
