import { Command } from 'commander';

/**
 * `jho init [<name>]` — campaign creation wizard (stub, full impl in 4c).
 */
export const initCommand = new Command('init')
  .description('Create a new campaign (wizard)')
  .argument('[name]', 'campaign name', 'default')
  .option('--cv <path>', 'path to CV file')
  .option('--github <user>', 'GitHub username')
  .option('-y, --yes', 'skip prompts and use defaults')
  .action(() => {
    process.stderr.write('jho init: not implemented yet (planned: phase 4c)\n');
    process.exit(1);
  });

initCommand.addHelpText(
  'after',
  `
Examples:
  $ jho init                  # default campaign
  $ jho init freelance        # named campaign
  $ jho init --cv ./cv.pdf    # skip CV path prompt
`,
);
