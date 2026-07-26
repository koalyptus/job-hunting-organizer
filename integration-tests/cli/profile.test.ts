import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { profileCommand } from '../../src/cli/commands/profile.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

describe('CLI: profile command', () => {
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

  it('shows profile help', async () => {
    const { stdout, exitCode } = await runCommand(profileCommand, ['profile', '--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Show or rebuild');
  });

  it('profile shows existing profile content', async () => {
    const campaignDir = join(env.dataRoot, 'campaigns', 'default');
    await writeFile(join(campaignDir, 'profile.md'), '# Profile\n\nTest profile content.');

    const { stdout, exitCode } = await runCommand(profileCommand, ['profile', 'show']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Profile');
  });
});
