import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { renameCampaignCommand } from '../../src/cli/commands/rename-campaign.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

describe('CLI: rename-campaign command', () => {
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

  it('renames a campaign', async () => {
    const { stdout, exitCode } = await runCommand(renameCampaignCommand, [
      'rename-campaign',
      'new-campaign',
      '--from',
      'default',
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Renamed');
  });
});
