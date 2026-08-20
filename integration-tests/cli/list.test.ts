import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Command } from 'commander';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { listCommand } from '../../src/cli/commands/list.js';
import { createApplication, updateApplication } from '../../src/core/applications/applications.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

/**
 * Add --campaign to the parent command, matching the production CLI wiring
 * in src/cli/index.ts where --campaign is a top-level global option.
 * runCommand creates a fresh parent without that option, so we inject it here.
 */
function withCampaignParent(parent: Command) {
  parent.option('--campaign <name>', 'campaign name');
}

describe('CLI: list command', () => {
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

  it('lists all applications', async () => {
    await createApplication({ appliedDir: env.appliedDir, title: 'App A', company: 'Co A' });
    await createApplication({ appliedDir: env.appliedDir, title: 'App B', company: 'Co B' });

    const { stdout, exitCode } = await runCommand(
      listCommand,
      ['--campaign', 'default', 'list'],
      withCampaignParent,
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain('App A');
    expect(stdout).toContain('App B');
  });

  it('filters by status', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Filter App',
      company: 'FilterCo',
    });
    await updateApplication(env.appliedDir, slug, { status: 'interview' });
    await createApplication({
      appliedDir: env.appliedDir,
      title: 'Applied App',
      company: 'AppliedCo',
    });

    const { stdout, exitCode } = await runCommand(
      listCommand,
      ['--campaign', 'default', 'list', '--status', 'interview'],
      withCampaignParent,
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Filter App');
    expect(stdout).not.toContain('Applied App');
  });

  it('lists as JSON', async () => {
    await createApplication({ appliedDir: env.appliedDir, title: 'JSON App', company: 'JSONCo' });

    const { stdout, exitCode } = await runCommand(
      listCommand,
      ['--campaign', 'default', 'list', '--json'],
      withCampaignParent,
    );

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe('JSON App');
  });

  it('lists campaigns when no campaign specified', async () => {
    const { stdout, exitCode } = await runCommand(listCommand, ['list']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('default');
  });
});
