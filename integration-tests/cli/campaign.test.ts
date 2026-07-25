import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { campaignCommand } from '../../src/cli/commands/campaign.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

describe('CLI: campaign command', () => {
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

  it('lists campaigns', async () => {
    const { stdout, exitCode } = await runCommand(campaignCommand, ['campaign', '--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Operations on a campaign');
  });

  it('stubs are under development', async () => {
    const { stderr, exitCode } = await runCommand(campaignCommand, [
      'campaign',
      'rename',
      'default',
      'new-name',
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
  });
});
