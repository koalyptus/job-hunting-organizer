import { describe, expect, it } from 'vitest';
import { runCommand } from '../helpers.js';
import { retroCommand } from '../../commands/retro.js';
import { prepareCommand } from '../../commands/prepare.js';
import { helpCommand } from '../../commands/help.js';
import { mcpCommand } from '../../commands/mcp.js';
import { campaignCommand } from '../../commands/campaign.js';
import { profileCommand } from '../../commands/profile.js';

describe('stub commands exit with correct phase messages', () => {
  it('retro exits with slug missing error when run outside app folder', async () => {
    const { stderr, exitCode } = await runCommand(retroCommand, ['retro']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('missing <slug> argument');
  });

  it('prepare exits with slug missing error when run outside app folder', async () => {
    const { stderr, exitCode } = await runCommand(prepareCommand, ['prepare']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('missing <slug> argument');
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

  it('campaign init stub exits with code 1', async () => {
    const initStub = campaignCommand.commands.find((c) => c.name() === 'init')!;
    const { stderr, exitCode } = await runCommand(initStub, ['init']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 4c');
  });

  it('campaign rename stub exits with code 1', async () => {
    const renameStub = campaignCommand.commands.find((c) => c.name() === 'rename')!;
    const { stderr, exitCode } = await runCommand(renameStub, ['rename']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not implemented yet');
    expect(stderr).toContain('phase 4b');
  });
});
