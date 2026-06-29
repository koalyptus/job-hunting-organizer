import { Command } from 'commander';
import { userWarn } from '../output.js';

/**
 * `jho help [<cmd>|<topic>]` — show help for a command or topic.
 */
export const helpCommand = new Command('help')
  .description('Show help for a command or topic')
  .argument('[subject]', 'command or topic to get help on')
  .action(() => {
    userWarn('jho help: not implemented yet (planned: phase 4d)');
    process.exit(1);
  });

helpCommand.addHelpText(
  'after',
  `
Examples:
  $ jho help                    # show all commands
  $ jho help track              # help for the track command
  $ jho help campaign           # help for the campaign topic
  $ jho help cover-letter       # help for cover-letter generation
`,
);
