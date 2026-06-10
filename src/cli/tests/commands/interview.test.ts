import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { interviewCommand } from '../../commands/interview.js';

describe('interview command', () => {
  async function run(
    ...argv: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    const origStdout = process.stdout.write;
    const origStderr = process.stderr.write;
    const origExit = process.exit;

    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      return true;
    }) as typeof process.stderr.write;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`EXIT_${exitCode}`);
    }) as never;

    const parent = new Command('test-parent').addCommand(interviewCommand);
    try {
      await parent.parseAsync(['node', 'test-parent', 'interview', ...argv]);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.startsWith('EXIT_')) {
        exitCode = parseInt(e.message.replace('EXIT_', ''), 10);
      } else {
        throw e;
      }
    } finally {
      process.stdout.write = origStdout;
      process.stderr.write = origStderr;
      process.exit = origExit;
    }

    return { stdout, stderr, exitCode };
  }

  it('add exits with code 1 (stub)', async () => {
    const { stderr, exitCode } = await run('add', '--when', '2026-06-15 10:00', '--duration', '60');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
  });

  it('list exits with code 1 (stub)', async () => {
    const { stderr, exitCode } = await run('list');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
  });

  it('mark exits with code 1 (stub)', async () => {
    const { stderr, exitCode } = await run('mark', '1', '--status', 'passed');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
  });

  it('notes exits with code 1 (stub)', async () => {
    const { stderr, exitCode } = await run('notes', '1', '--append', 'They asked about systems');
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
  });
});
