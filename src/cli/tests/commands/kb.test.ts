import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCommand } from '../helpers.js';
import { kbCommand } from '../../commands/kb.js';
import * as kbIngest from '../../../core/campaign/kb-ingest.js';
import { updateCampaignConfig, clearConfigCache } from '../../../core/config/config.js';

describe('kb command', () => {
  let dataRoot: string;
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(`${tmpdir()}/jho-kb-cli-`);
    dataRoot = join(home, 'data');
    process.env['HOME'] = home;
    process.env['USERPROFILE'] = home;
    process.env['JHO_DATA'] = dataRoot;
    process.env['JHO_CONFIG_HOME'] = join(home, 'config');
    clearConfigCache();
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
    delete process.env['JHO_DATA'];
    delete process.env['JHO_CONFIG_HOME'];
    delete process.env['HOME'];
    delete process.env['USERPROFILE'];
    clearConfigCache();
  });

  async function setupCampaign(name = 'default') {
    const campaignRoot = join(dataRoot, 'campaigns', name);
    await mkdir(join(campaignRoot, 'knowledge-base'), { recursive: true });
    updateCampaignConfig(name, {
      version: 1,
      profile: { path: join(campaignRoot, 'profile.md') },
      cv: { path: '' },
      linkedin: { url: '' },
      knowledgeBase: { dir: join(campaignRoot, 'knowledge-base'), sources: [] },
    });
    return campaignRoot;
  }

  it('add copies a doc into the campaign knowledge base', async () => {
    const campaignRoot = await setupCampaign();
    const srcDir = await mkdtemp(`${home}/jho-kb-src-`);
    const srcFile = join(srcDir, 'tips.md');
    await writeFile(srcFile, '# tips');

    const { stdout, exitCode } = await runCommand(kbCommand, ['kb', 'add', srcFile]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Copied 1 knowledge-base doc');
    await expect(
      import('node:fs/promises').then((fs) =>
        fs.readFile(join(campaignRoot, 'knowledge-base', 'tips.md'), 'utf8'),
      ),
    ).resolves.toBe('# tips');
  });

  it('update re-syncs from recorded sources', async () => {
    const campaignRoot = await setupCampaign();
    const srcDir = await mkdtemp(`${home}/jho-kb-src2-`);
    const srcFile = join(srcDir, 'notes.md');
    await writeFile(srcFile, 'notes');
    updateCampaignConfig('default', {
      version: 1,
      profile: { path: '' },
      cv: { path: '' },
      linkedin: { url: '' },
      knowledgeBase: { dir: join(campaignRoot, 'knowledge-base'), sources: [srcDir] },
    });

    const { stdout, exitCode } = await runCommand(kbCommand, ['kb', 'update']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('re-synced');
    await expect(
      import('node:fs/promises').then((fs) =>
        fs.readFile(join(campaignRoot, 'knowledge-base', 'notes.md'), 'utf8'),
      ),
    ).resolves.toBe('notes');
  });

  it('add errors when no supported docs are found', async () => {
    await setupCampaign();
    const srcDir = await mkdtemp(`${home}/jho-kb-src-`);
    const srcFile = join(srcDir, 'data.bin');
    await writeFile(srcFile, 'binary');

    const { stderr, exitCode } = await runCommand(kbCommand, ['kb', 'add', srcFile]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('No supported docs found');
  });

  it('add copies only supported docs from a mixed folder', async () => {
    const campaignRoot = await setupCampaign();
    const srcDir = await mkdtemp(`${home}/jho-kb-src-`);
    await writeFile(join(srcDir, 'a.md'), 'a');
    await writeFile(join(srcDir, 'ignore.bin'), 'x');

    const { stdout, exitCode } = await runCommand(kbCommand, ['kb', 'add', srcDir]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Copied 1 knowledge-base doc');
    await expect(
      import('node:fs/promises').then((fs) =>
        fs.readFile(join(campaignRoot, 'knowledge-base', 'a.md'), 'utf8'),
      ),
    ).resolves.toBe('a');
  });

  it('update reports an empty knowledge base without erroring', async () => {
    await setupCampaign();

    const { stdout, exitCode } = await runCommand(kbCommand, ['kb', 'update']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Knowledge base is empty');
  });

  it('update refreshes manually-placed docs without external sources', async () => {
    const campaignRoot = await setupCampaign();
    await writeFile(join(campaignRoot, 'knowledge-base', 'manual.md'), 'manual');

    const { stdout, exitCode } = await runCommand(kbCommand, ['kb', 'update']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('refreshed');
    expect(stdout).toContain('1 doc');
  });

  it('add accepts multiple paths', async () => {
    const campaignRoot = await setupCampaign();
    const srcDir = await mkdtemp(`${home}/jho-kb-src-`);
    const f1 = join(srcDir, 'a.md');
    const f2 = join(srcDir, 'b.txt');
    await writeFile(f1, 'a');
    await writeFile(f2, 'b');

    const { stdout, exitCode } = await runCommand(kbCommand, ['kb', 'add', f1, f2]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Copied 2 knowledge-base doc');
    await expect(
      import('node:fs/promises').then((fs) =>
        fs.readFile(join(campaignRoot, 'knowledge-base', 'b.txt'), 'utf8'),
      ),
    ).resolves.toBe('b');
  });

  it('add surfaces ingestion errors and exits non-zero', async () => {
    await setupCampaign();
    vi.spyOn(kbIngest, 'ingestKnowledgeBase').mockRejectedValue(new kbIngest.KbError('boom'));

    const { stderr, exitCode } = await runCommand(kbCommand, ['kb', 'add', '/tmp/x.md']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('boom');
  });

  it('add re-throws unexpected non-KbError errors', async () => {
    await setupCampaign();
    vi.spyOn(kbIngest, 'ingestKnowledgeBase').mockRejectedValue(new Error('weird'));

    await expect(runCommand(kbCommand, ['kb', 'add', '/tmp/x.md'])).rejects.toThrow('weird');
  });

  it('update re-throws unexpected non-KbError errors', async () => {
    await setupCampaign();
    vi.spyOn(kbIngest, 'syncKnowledgeBase').mockRejectedValue(new Error('weird'));

    await expect(runCommand(kbCommand, ['kb', 'update'])).rejects.toThrow('weird');
  });
});
