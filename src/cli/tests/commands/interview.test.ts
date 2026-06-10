import { describe, expect, it } from 'vitest';
import { runCommand } from '../helpers.js';
import { interviewCommand } from '../../commands/interview.js';

describe('interview command', () => {
  it('add exits with code 1 (stub)', async () => {
    const { stderr, exitCode } = await runCommand(interviewCommand, [
      'interview',
      'add',
      '--when',
      '2026-06-15 10:00',
      '--duration',
      '60',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
  });

  it('list exits with code 1 (stub)', async () => {
    const { stderr, exitCode } = await runCommand(interviewCommand, ['interview', 'list']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
  });

  it('mark exits with code 1 (stub)', async () => {
    const { stderr, exitCode } = await runCommand(interviewCommand, [
      'interview',
      'mark',
      '1',
      '--status',
      'passed',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
  });

  it('notes exits with code 1 (stub)', async () => {
    const { stderr, exitCode } = await runCommand(interviewCommand, [
      'interview',
      'notes',
      '1',
      '--append',
      'They asked about systems',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
  });
});
