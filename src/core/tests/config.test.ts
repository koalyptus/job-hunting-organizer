import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  loadGlobalConfig,
  loadCampaignConfig,
  getConfig,
  updateCampaignConfig,
  clearConfigCache,
} from '../config.js';
import { resolve } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { DEFAULT_CONFIG_FILENAME } from '../paths.js';

describe('config', () => {
  let testHome: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;
  let originalJhoData: string | undefined;
  let originalJhoConfigHome: string | undefined;
  let originalJhoDefaultCampaign: string | undefined;

  beforeEach(async () => {
    // Use a temporary directory for testing
    originalHome = process.env['HOME'];
    originalUserProfile = process.env['USERPROFILE'];
    originalJhoData = process.env['JHO_DATA'];
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoDefaultCampaign = process.env['JHO_DEFAULT_CAMPAIGN'];
    testHome = await mkdtemp(`${tmpdir()}/jho-test-`);
    process.env['HOME'] = testHome;
    process.env['USERPROFILE'] = testHome;
    delete process.env['JHO_DATA'];
    delete process.env['JHO_CONFIG_HOME'];
    delete process.env['JHO_DEFAULT_CAMPAIGN'];
    clearConfigCache();
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env['HOME'];
    } else {
      process.env['HOME'] = originalHome;
    }
    if (originalUserProfile === undefined) {
      delete process.env['USERPROFILE'];
    } else {
      process.env['USERPROFILE'] = originalUserProfile;
    }
    if (originalJhoData === undefined) {
      delete process.env['JHO_DATA'];
    } else {
      process.env['JHO_DATA'] = originalJhoData;
    }
    if (originalJhoConfigHome === undefined) {
      delete process.env['JHO_CONFIG_HOME'];
    } else {
      process.env['JHO_CONFIG_HOME'] = originalJhoConfigHome;
    }
    if (originalJhoDefaultCampaign === undefined) {
      delete process.env['JHO_DEFAULT_CAMPAIGN'];
    } else {
      process.env['JHO_DEFAULT_CAMPAIGN'] = originalJhoDefaultCampaign;
    }
    clearConfigCache();
    await rm(testHome, { recursive: true, force: true });
  });

  it('loads global config with defaults', () => {
    const config = loadGlobalConfig();
    expect(config.version).toBe(1);
    expect(config.llm.baseUrl).toBe('http://localhost:11434/v1');
    expect(config.llm.model).toBe('llama3.1');
    expect(config.llm.apiKey).toBe('no-key');
  });

  it('respects JHO_DATA environment variable', () => {
    const customRoot = resolve(testHome, 'custom-jho-data');
    process.env.JHO_DATA = customRoot;

    const config = loadGlobalConfig();
    expect(config.dataRoot).toBe(customRoot);
  });

  it('loads campaign config', () => {
    const campaign = loadCampaignConfig('test-campaign');
    // Should have default values from schema
    expect(campaign.version).toBe(1);
    expect(campaign.profile.path).toBe(''); // default empty string
  });

  it('global and campaign keys are disjoint', () => {
    const { global, campaign } = getConfig('test');
    // Global must NOT carry per-campaign fields.
    expect('profile' in global).toBe(false);
    expect('cv' in global).toBe(false);
    expect('applied' in global).toBe(false);
    expect('knowledgeBase' in global).toBe(false);
    // Campaign must NOT carry global fields.
    expect('llm' in campaign).toBe(false);
    expect('github' in campaign).toBe(false);
    expect('calendar' in campaign).toBe(false);
    expect('logging' in campaign).toBe(false);
  });

  it('getConfig uses default campaign name when not specified', () => {
    updateCampaignConfig('default', { applied: { dir: '/campaign/applied' } });

    const { campaign } = getConfig(); // no campaign name specified
    expect(campaign.applied.dir).toBe('/campaign/applied');
  });

  it('global config does not default profile / cv / applied / knowledgeBase', () => {
    const global = loadGlobalConfig();
    expect('profile' in global).toBe(false);
    expect('cv' in global).toBe(false);
    expect('applied' in global).toBe(false);
    expect('knowledgeBase' in global).toBe(false);
  });

  it('rejects a global config file with a wrong schema version', async () => {
    // Write a config file directly to disk with version 99 — older
    // (or future) schema. The loader must surface a clear error
    // rather than silently defaulting.
    const configHome = resolve(testHome, '.job-hunting-organizer');
    await mkdir(configHome, { recursive: true });
    await writeFile(
      resolve(configHome, DEFAULT_CONFIG_FILENAME),
      JSON.stringify({ version: 99, llm: {}, github: {}, calendar: {}, logging: {} }),
      'utf8',
    );

    expect(() => loadGlobalConfig()).toThrowError(/migration|schema version/i);
  });

  it('rejects a campaign config file with a wrong schema version', async () => {
    const campaignRoot = resolve(testHome, 'job-hunting-organizer-data', 'campaigns', 'stale');
    await mkdir(campaignRoot, { recursive: true });
    await writeFile(
      resolve(campaignRoot, DEFAULT_CONFIG_FILENAME),
      JSON.stringify({ version: 0, profile: {}, cv: {}, applied: {}, knowledgeBase: {} }),
      'utf8',
    );

    expect(() => loadCampaignConfig('stale')).toThrowError(/migration|schema version/i);
  });
});
