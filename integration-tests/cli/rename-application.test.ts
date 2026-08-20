import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { renameApplicationCommand } from '../../src/cli/commands/rename-application.js';
import { createApplication } from '../../src/workflow/applications/applications.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

describe('CLI: rename-application command', () => {
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

  it('renames an application', async () => {
    const oldSlug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Old Name',
      company: 'OldCo',
    });

    const { stdout, exitCode } = await runCommand(renameApplicationCommand, [
      'rename-application',
      '2026-Jun-03-SE-NewCo',
      '--from',
      oldSlug,
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Renamed');
  });

  it('errors on missing slug', async () => {
    const { stderr, exitCode } = await runCommand(renameApplicationCommand, [
      'rename-application',
      'non-existent',
    ]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('missing');
  });
});
