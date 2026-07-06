import { describe, expect, it } from 'vitest';
import type { Command } from 'commander';
import { configCommand } from '../../commands/config.js';
import { campaignCommand } from '../../commands/campaign.js';
import { ownershipCommand } from '../../commands/ownership.js';
import { profileCommand } from '../../commands/profile.js';
import { initCommand } from '../../commands/init.js';
import { renameCampaignCommand } from '../../commands/rename-campaign.js';
import { trackCommand } from '../../commands/track.js';
import { listCommand } from '../../commands/list.js';
import { showCommand } from '../../commands/show.js';
import { coverLetterCommand } from '../../commands/cover-letter.js';
import { answerCommand } from '../../commands/answer.js';
import { interviewCommand } from '../../commands/interview.js';
import { retroCommand } from '../../commands/retro.js';
import { prepareCommand } from '../../commands/prepare.js';
import { doctorCommand } from '../../commands/doctor.js';
import { repairCommand } from '../../commands/repair.js';
import { statsCommand } from '../../commands/stats.js';
import { helpCommand } from '../../commands/help.js';
import { mcpCommand } from '../../commands/mcp.js';

const commands = [
  ['config', configCommand],
  ['campaign', campaignCommand],
  ['ownership', ownershipCommand],
  ['profile', profileCommand],
  ['init', initCommand],
  ['rename-campaign', renameCampaignCommand],
  ['track', trackCommand],
  ['list', listCommand],
  ['show', showCommand],
  ['cover-letter', coverLetterCommand],
  ['answer', answerCommand],
  ['interview', interviewCommand],
  ['retro', retroCommand],
  ['prepare', prepareCommand],
  ['doctor', doctorCommand],
  ['repair', repairCommand],
  ['stats', statsCommand],
  ['help', helpCommand],
  ['mcp', mcpCommand],
];

describe('command --help output', () => {
  for (const [name, cmd] of commands) {
    it(`${name} has consistent help output`, () => {
      expect((cmd as Command).helpInformation()).toMatchSnapshot();
    });
  }
});

describe('campaign subcommands --help', () => {
  it('campaign config has consistent help output', () => {
    const configSub = campaignCommand.commands.find((c) => c.name() === 'config');
    expect(configSub?.helpInformation()).toMatchSnapshot();
  });
});

describe('interview subcommands --help', () => {
  const subcommands = ['add', 'list', 'mark', 'notes'];

  for (const sub of subcommands) {
    it(`interview ${sub} has consistent help output`, () => {
      const subCmd = interviewCommand.commands.find((c) => c.name() === sub);
      expect(subCmd?.helpInformation()).toMatchSnapshot();
    });
  }
});

describe('profile subcommands --help', () => {
  const subcommands = ['show', 'rebuild'];

  for (const sub of subcommands) {
    it(`profile ${sub} has consistent help output`, () => {
      const subCmd = profileCommand.commands.find((c) => c.name() === sub);
      expect(subCmd?.helpInformation()).toMatchSnapshot();
    });
  }
});

describe('retro subcommands --help', () => {
  const subcommands = ['show', 'append', 'aggregate'];

  for (const sub of subcommands) {
    it(`retro ${sub} has consistent help output`, () => {
      const subCmd = retroCommand.commands.find((c) => c.name() === sub);
      expect(subCmd?.helpInformation()).toMatchSnapshot();
    });
  }
});
