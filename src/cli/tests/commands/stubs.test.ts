import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { initCommand } from '../../commands/init.js';
import { renameCampaignCommand } from '../../commands/rename-campaign.js';
import { trackCommand } from '../../commands/track.js';
import { listCommand } from '../../commands/list.js';
import { showCommand } from '../../commands/show.js';
import { coverLetterCommand } from '../../commands/cover-letter.js';
import { answerCommand } from '../../commands/answer.js';
import { retroCommand } from '../../commands/retro.js';
import { prepareCommand } from '../../commands/prepare.js';
import { doctorCommand } from '../../commands/doctor.js';
import { repairCommand } from '../../commands/repair.js';
import { statsCommand } from '../../commands/stats.js';
import { helpCommand } from '../../commands/help.js';
import { mcpCommand } from '../../commands/mcp.js';
import { profileCommand } from '../../commands/profile.js';

/**
 * Run a stub command via `parseAsync` with mocked `process.exit`.
 * Wraps the command as a subcommand of a throwaway parent so
 * commander's argument parsing works correctly.
 */
async function runStub(
  cmd: Command,
): Promise<{ stderr: string; stdout: string; exitCode: number }> {
  let stderr = '';
  let stdout = '';
  let exitCode = 0;

  const origStderr = process.stderr.write;
  const origStdout = process.stdout.write;
  const origExit = process.exit;

  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
    return true;
  }) as typeof process.stderr.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`EXIT_${exitCode}`);
  }) as never;

  const parent = new Command('test-parent').addCommand(cmd);

  try {
    await parent.parseAsync(['node', 'test-parent', cmd.name()]);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.startsWith('EXIT_')) {
      exitCode = parseInt(e.message.replace('EXIT_', ''), 10);
    } else {
      throw e;
    }
  } finally {
    process.stderr.write = origStderr;
    process.stdout.write = origStdout;
    process.exit = origExit;
  }

  return { stderr, stdout, exitCode };
}

describe('stub commands exit with correct phase messages', () => {
  it('init exits with code 1 and mentions phase 4c', async () => {
    const { stderr, exitCode } = await runStub(initCommand);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 4c');
  });

  it('rename-campaign exits with code 1 and mentions phase 4b', async () => {
    const { stderr, exitCode } = await runStub(renameCampaignCommand);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 4b');
  });

  it('track exits with code 1 and mentions phase 5', async () => {
    const { stderr, exitCode } = await runStub(trackCommand);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 5');
  });

  it('list exits with code 1 and mentions phase 5', async () => {
    const { stderr, exitCode } = await runStub(listCommand);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 5');
  });

  it('show exits with code 1 and mentions phase 7', async () => {
    const { stderr, exitCode } = await runStub(showCommand);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 7');
  });

  it('cover-letter exits with code 1 and mentions phase 6', async () => {
    const { stderr, exitCode } = await runStub(coverLetterCommand);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 6');
  });

  it('answer exits with code 1 and mentions phase 6', async () => {
    const { stderr, exitCode } = await runStub(answerCommand);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 6');
  });

  it('retro exits with code 1 and mentions phase 7', async () => {
    const { stderr, exitCode } = await runStub(retroCommand);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 7');
  });

  it('prepare exits with code 1 and mentions phase 7', async () => {
    const { stderr, exitCode } = await runStub(prepareCommand);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 7');
  });

  it('doctor exits with code 1 and mentions phase 7', async () => {
    const { stderr, exitCode } = await runStub(doctorCommand);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 7');
  });

  it('repair exits with code 1 and mentions phase 7', async () => {
    const { stderr, exitCode } = await runStub(repairCommand);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 7');
  });

  it('stats exits with code 1 and mentions phase 5', async () => {
    const { stderr, exitCode } = await runStub(statsCommand);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 5');
  });

  it('help exits with code 1 and mentions phase 4d', async () => {
    const { stderr, exitCode } = await runStub(helpCommand);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 4d');
  });

  it('mcp exits with code 1 and mentions phase 8', async () => {
    const { stderr, exitCode } = await runStub(mcpCommand);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 8');
  });

  it('profile rebuild exits with code 1 and mentions phase 4c', async () => {
    const rebuildCmd = profileCommand.commands.find((c) => c.name() === 'rebuild')!;
    const { stderr, exitCode } = await runStub(rebuildCmd);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 4c');
  });
});
