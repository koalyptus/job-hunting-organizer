import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  loadGlobalConfig,
  loadCampaignConfig,
  getConfig,
  updateGlobalConfig,
  updateCampaignConfig,
  clearConfigCache,
} from '../config.js';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';

describe('config', () => {
  let testHome: string;
  let originalHome: string | undefined;
  let originalJhoData: string | undefined;
  let originalJhoConfigHome: string | undefined;

  beforeEach(async () => {
    // Use a temporary directory for testing
    originalHome = process.env['HOME'];
    originalJhoData = process.env['JHO_DATA'];
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    testHome = await mkdtemp(`${homedir()}/jho-test-`);
    process.env['HOME'] = testHome;
    delete process.env['JHO_DATA'];
    delete process.env['JHO_CONFIG_HOME'];
    clearConfigCache();
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env['HOME'];
    } else {
      process.env['HOME'] = originalHome;
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
    clearConfigCache();
    await rm(testHome, { recursive: true, force: true });
  });

  it('loads global config with defaults', () => {
    const config = loadGlobalConfig();
    expect(config.version).toBe(1);
    expect(config.llm.baseUrl).toBe('http://localhost:11434/v1');
    expect(config.llm.model).toBe('llama3.1');
    expect(config.llm.apiKey).toBe('ollama');
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

  it('merges global and campaign config', () => {
    // Set a global value
    updateGlobalConfig({
      llm: { baseUrl: 'http://test', apiKey: 'test-key', model: 'test-model' },
    });

    // Set a campaign value
    updateCampaignConfig('test', { applied: { dir: '/custom/applied' } });

    const { merged } = getConfig('test');
    expect(merged.llm.model).toBe('test-model'); // from global
    expect(merged.applied.dir).toBe('/custom/applied'); // from campaign
  });

  it('global and campaign keys are disjoint', () => {
    const { global, campaign, merged } = getConfig('test');
    // Global must NOT carry per-campaign fields anymore.
    expect('profile' in global).toBe(false);
    expect('cv' in global).toBe(false);
    expect('applied' in global).toBe(false);
    expect('knowledgeBase' in global).toBe(false);
    // Campaign must NOT carry global fields.
    expect('llm' in campaign).toBe(false);
    expect('github' in campaign).toBe(false);
    expect('calendar' in campaign).toBe(false);
    expect('logging' in campaign).toBe(false);
    // Merged view has both layers.
    expect(merged.llm).toBeDefined();
    expect(merged.applied).toBeDefined();
    expect(merged.profile).toBeDefined();
  });

  it('getConfig uses default campaign name when not specified', () => {
    updateCampaignConfig('default', { applied: { dir: '/campaign/applied' } });

    const { merged } = getConfig(); // no campaign name specified
    expect(merged.applied.dir).toBe('/campaign/applied');
  });

  it('global config does not default profile / cv / applied / knowledgeBase', () => {
    const global = loadGlobalConfig();
    expect('profile' in global).toBe(false);
    expect('cv' in global).toBe(false);
    expect('applied' in global).toBe(false);
    expect('knowledgeBase' in global).toBe(false);
  });
});
