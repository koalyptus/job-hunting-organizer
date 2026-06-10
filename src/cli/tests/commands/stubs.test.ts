import { describe, expect, it } from 'vitest';
import { runCommand } from '../helpers.js';
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

describe('stub commands exit with correct phase messages', () => {
  it('init exits with code 1 and mentions phase 4c', async () => {
    const { stderr, exitCode } = await runCommand(initCommand, ['init']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 4c');
  });

  it('rename-campaign exits with code 1 and mentions phase 4b', async () => {
    const { stderr, exitCode } = await runCommand(renameCampaignCommand, ['rename-campaign']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 4b');
  });

  it('track exits with code 1 and mentions phase 5', async () => {
    const { stderr, exitCode } = await runCommand(trackCommand, ['track']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 5');
  });

  it('list exits with code 1 and mentions phase 5', async () => {
    const { stderr, exitCode } = await runCommand(listCommand, ['list']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 5');
  });

  it('show exits with code 1 and mentions phase 7', async () => {
    const { stderr, exitCode } = await runCommand(showCommand, ['show']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 7');
  });

  it('cover-letter exits with code 1 and mentions phase 6', async () => {
    const { stderr, exitCode } = await runCommand(coverLetterCommand, ['cover-letter']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 6');
  });

  it('answer exits with code 1 and mentions phase 6', async () => {
    const { stderr, exitCode } = await runCommand(answerCommand, ['answer']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 6');
  });

  it('retro exits with code 1 and mentions phase 7', async () => {
    const { stderr, exitCode } = await runCommand(retroCommand, ['retro']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 7');
  });

  it('prepare exits with code 1 and mentions phase 7', async () => {
    const { stderr, exitCode } = await runCommand(prepareCommand, ['prepare']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 7');
  });

  it('doctor exits with code 1 and mentions phase 7', async () => {
    const { stderr, exitCode } = await runCommand(doctorCommand, ['doctor']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 7');
  });

  it('repair exits with code 1 and mentions phase 7', async () => {
    const { stderr, exitCode } = await runCommand(repairCommand, ['repair']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 7');
  });

  it('stats exits with code 1 and mentions phase 5', async () => {
    const { stderr, exitCode } = await runCommand(statsCommand, ['stats']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 5');
  });

  it('help exits with code 1 and mentions phase 4d', async () => {
    const { stderr, exitCode } = await runCommand(helpCommand, ['help']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 4d');
  });

  it('mcp exits with code 1 and mentions phase 8', async () => {
    const { stderr, exitCode } = await runCommand(mcpCommand, ['mcp']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 8');
  });

  it('profile rebuild exits with code 1 and mentions phase 4c', async () => {
    const rebuildCmd = profileCommand.commands.find((c) => c.name() === 'rebuild')!;
    const { stderr, exitCode } = await runCommand(rebuildCmd, ['rebuild']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 4c');
  });
});
