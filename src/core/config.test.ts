import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  loadGlobalConfig,
  loadCampaignConfig,
  getConfig,
  updateGlobalConfig,
  updateCampaignConfig,
  clearConfigCache,
} from './config.js';
import { resolve } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { homedir } from 'node:os';

describe('config', () => {
  let testHome: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    // Use a temporary directory for testing
    testHome = await mkdtemp(`${homedir()}/jho-test-`);
    process.env.HOME = testHome;
    process.env.JHO_ROOT = undefined;
    clearConfigCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    clearConfigCache();
  });

  it('loads global config with defaults', () => {
    const config = loadGlobalConfig();
    expect(config.version).toBe(1);
    expect(config.llm.baseUrl).toBe('http://localhost:11434/v1');
    expect(config.llm.model).toBe('llama3.1');
    expect(config.llm.apiKey).toBe('ollama');
  });

  it('respects JHO_ROOT environment variable', () => {
    const customRoot = resolve(testHome, 'custom-jho');
    process.env.JHO_ROOT = customRoot;

    const config = loadGlobalConfig();
    expect(config.root).toBe(customRoot);
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

  it('getConfig uses default campaign name when not specified', () => {
    updateGlobalConfig({ applied: { dir: '/global/applied' } });
    updateCampaignConfig('default', { applied: { dir: '/campaign/applied' } });

    const { merged } = getConfig(); // no campaign name specified
    expect(merged.applied.dir).toBe('/campaign/applied'); // campaign wins
  });
});
