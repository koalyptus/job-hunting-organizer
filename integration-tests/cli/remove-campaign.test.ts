import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { removeCampaignCommand } from '../../src/cli/commands/remove-campaign.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

describe('CLI: remove-campaign command', () => {
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

  it('removes a campaign with -y flag', async () => {
    const { stdout, exitCode } = await runCommand(removeCampaignCommand, [
      'remove-campaign',
      'default',
      '-y',
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Removed');
  });
});
