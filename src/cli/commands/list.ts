import { Command } from 'commander';
import { collectTags } from '../options.js';
import { userInfo } from '../output.js';

/**
 * `jho list` — list all applications.
 */
export const listCommand = new Command('list')
  .description('List all applications')
  .option('--status <status>', 'filter by status')
  .option('--tag <tag>', 'filter by tag (repeatable)', collectTags, [])
  .option('--role <role>', 'filter by target role')
  .option('--json', 'output as JSON')
  .action(() => {
    userInfo('jho list: not implemented yet (planned: phase 5)');
    process.exit(1);
  });

listCommand.addHelpText(
  'after',
  `
Examples:
  $ jho list                          # all applications
  $ jho list --status interview       # filter by status
  $ jho list --role frontend-dev      # filter by role
  $ jho list --tag remote             # filter by tag
  $ jho list --json                   # JSON output
`,
);
