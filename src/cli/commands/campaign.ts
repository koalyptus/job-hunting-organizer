import { Command } from 'commander';
import { campaignConfigCommand } from './campaign-config.js';
import { userInfo } from '../output.js';

/**
 * `jho campaign <subcommand>` — operations on a campaign.
 * Parent command; subcommands registered below.
 */
export const campaignCommand = new Command('campaign')
  .description('Operations on a campaign')
  .addCommand(campaignConfigCommand);

// Stubs for planned subcommands
for (const [name, phase] of [
  ['init', '4c'],
  ['rename', '4b'],
  ['doctor', '7'],
  ['repair', '7'],
  ['stats', '5'],
] as const) {
  campaignCommand.addCommand(
    new Command(name).action(() => {
      userInfo(`jho campaign ${name}: not implemented yet (planned: phase ${phase})`);
      process.exit(1);
    }),
  );
}

campaignCommand.addHelpText(
  'after',
  `
Examples:
  $ jho campaign config show         # show campaign config
  $ jho campaign config path         # print campaign config path
  $ jho --campaign freelance config  # specify a campaign
`,
);
