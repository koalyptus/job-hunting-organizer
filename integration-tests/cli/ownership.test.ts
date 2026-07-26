import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { ownershipCommand } from '../../src/cli/commands/ownership.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

describe('CLI: ownership command', () => {
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

  it('shows file ownership', async () => {
    const { stdout, exitCode } = await runCommand(ownershipCommand, ['ownership']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('ownership');
  });
});
