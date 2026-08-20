import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { removeApplicationCommand } from '../../src/cli/commands/remove-application.js';
import { createApplication } from '../../src/core/applications/applications.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

describe('CLI: remove-application command', () => {
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

  it('removes an application with --yes flag', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Remove App',
      company: 'RemoveCo',
    });

    const { stdout, exitCode } = await runCommand(removeApplicationCommand, [
      'remove-application',
      slug,
      '--yes',
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Removed');
  });
});
