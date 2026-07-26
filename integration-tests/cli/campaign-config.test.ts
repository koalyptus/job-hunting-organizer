import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { campaignConfigCommand } from '../../src/cli/commands/campaign-config.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

describe('CLI: campaign-config command', () => {
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

  it('shows config path', async () => {
    const { stdout, exitCode } = await runCommand(campaignConfigCommand, ['config', 'path']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('config.json');
  });

  it('shows config content', async () => {
    const { stdout, exitCode } = await runCommand(campaignConfigCommand, ['config', 'show']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('version');
  });
});
