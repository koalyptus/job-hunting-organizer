import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { interviewCommand } from '../../src/cli/commands/interview.js';
import { createApplication } from '../../src/workflow/applications/applications.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

describe('CLI: interview command', () => {
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

  it('adds interview with flags', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Interview App',
      company: 'InterviewCo',
    });

    const { stdout, exitCode } = await runCommand(interviewCommand, [
      'interview',
      'add',
      slug,
      '--when',
      '2026-08-01 10:00',
      '--type',
      'technical',
      '--duration',
      '60',
      '--interviewer',
      'Alice',
      '--location',
      'Zoom',
      '--title',
      'Technical Screen',
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Interview saved to');
  });

  it('lists interviews', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'List Int',
      company: 'ListIntCo',
    });
    await runCommand(interviewCommand, [
      'interview',
      'add',
      slug,
      '--when',
      '2026-08-01 10:00',
      '--type',
      'hr',
    ]);

    const { stdout, exitCode } = await runCommand(interviewCommand, ['interview', 'list', slug]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('hr');
  });

  it('marks interview status', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Mark Int',
      company: 'MarkIntCo',
    });
    await runCommand(interviewCommand, [
      'interview',
      'add',
      slug,
      '--when',
      '2026-08-01 10:00',
      '--type',
      'final',
    ]);

    const { stdout, exitCode } = await runCommand(interviewCommand, [
      'interview',
      'mark',
      slug,
      '1',
      '--status',
      'completed',
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('marked as completed');
  });

  it('adds interview notes', async () => {
    const slug = await createApplication({
      appliedDir: env.appliedDir,
      title: 'Notes Int',
      company: 'NotesIntCo',
    });
    await runCommand(interviewCommand, [
      'interview',
      'add',
      slug,
      '--when',
      '2026-08-01 10:00',
      '--type',
      'technical',
    ]);

    const { stdout, exitCode } = await runCommand(interviewCommand, [
      'interview',
      'notes',
      slug,
      '1',
      '--append',
      'They asked about distributed systems',
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Notes appended');
  });
});
