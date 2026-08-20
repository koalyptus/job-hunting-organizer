import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { statsCommand } from '../../src/cli/commands/stats.js';
import {
  createApplication,
  updateApplication,
} from '../../src/workflow/applications/applications.js';
import { addInterview } from '../../src/core/interviews/index.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

describe('CLI: stats command', () => {
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

  it('shows stats for empty campaign', async () => {
    const { stdout, exitCode } = await runCommand(statsCommand, ['stats']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('default');
  });

  it('shows stats with applications', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Stat App',
      company: 'StatCo',
    });
    await updateApplication(env.appliedDir, slug, { status: 'interview' });
    await addInterview(env.appliedDir, slug, {
      when: '2026-08-01 10:00',
      type: 'technical',
      duration: 60,
      interviewer: 'Alice',
      location: 'Zoom',
    });

    const { stdout, exitCode } = await runCommand(statsCommand, ['stats']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('interview');
  });

  it('shows stats as JSON', async () => {
    await createApplication({
      appliedDir: env.appliedDir,
      title: 'JSON Stats',
      company: 'JSONStatsCo',
    });

    const { stdout, exitCode } = await runCommand(statsCommand, ['stats', '--json']);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toBeDefined();
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]?.name).toBe('default');
  });
});
