import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApplication } from '../../src/core/applications/applications.js';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { repairCommand } from '../../src/cli/commands/repair.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

describe('CLI: repair command', () => {
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

  it('repairs campaign', async () => {
    const { stdout, exitCode } = await runCommand(repairCommand, ['repair']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('repair');
  });

  it('repairs specific application', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Repair App',
      company: 'RepairCo',
    });
    const { stdout, exitCode } = await runCommand(repairCommand, ['repair', slug]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('repair');
  });
});
