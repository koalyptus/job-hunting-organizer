import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { configCommand } from '../../src/cli/commands/config.js';
import { loadGlobalConfig, loadCampaignConfig } from '../../src/lib/config/config.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

describe('CLI: config and campaign structure', () => {
  let env: TestEnv;
  let restore: () => void;

  beforeEach(async () => {
    env = await createTestCampaign();
    restore = setupTestEnv(env.configHome, env.dataRoot);
  });

  afterEach(async () => {
    restore();
    await cleanupTestDir(env.testHome);
  });

  it('config show displays global config', async () => {
    const { stdout, exitCode } = await runCommand(configCommand, ['config', 'show']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('dataRoot');
    expect(stdout).toContain('llm');
  });

  it('config path prints config path', async () => {
    const { stdout, exitCode } = await runCommand(configCommand, ['config', 'path']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('config.json');
  });

  it('global config is loadable from test env', async () => {
    const config = loadGlobalConfig();
    expect(config).toBeDefined();
    expect(config.dataRoot).toBe(env.dataRoot);
    expect(config.llm.baseUrl).toBe('http://localhost:11434/v1');
  });

  it('campaign config is loadable from test env', async () => {
    const config = loadCampaignConfig('default');
    expect(config).toBeDefined();
  });

  it('campaign directory structure exists', async () => {
    const campaignDir = join(env.dataRoot, 'campaigns', 'default');
    expect(existsSync(campaignDir)).toBe(true);
    expect(existsSync(join(campaignDir, 'applied'))).toBe(true);
    expect(existsSync(join(campaignDir, 'config.json'))).toBe(true);
  });

  it('can create additional campaigns', async () => {
    const freelanceDir = join(env.dataRoot, 'campaigns', 'freelance');
    await mkdir(join(freelanceDir, 'applied'), { recursive: true });
    await writeFile(
      join(freelanceDir, 'config.json'),
      JSON.stringify({
        version: 1,
        profile: { path: '' },
        cv: { path: '' },
        linkedin: { url: '' },
        applied: { dir: '' },
        knowledgeBase: { dir: '' },
      }),
    );

    expect(existsSync(freelanceDir)).toBe(true);

    const config = loadCampaignConfig('freelance');
    expect(config).toBeDefined();
  });
});
