import { Command } from 'commander';
import { userInfo } from '../output.js';

/**
 * `jho stats` — campaign snapshot.
 */
export const statsCommand = new Command('stats')
  .description('Show a campaign snapshot: counts by status, role, site, funnel')
  .option('--role <role>', 'filter stats by target role')
  .option('--since <date>', 'only count applications since a date')
  .option('--include-notes', 'include LLM-extracted abandonment reasons (costs tokens)')
  .option('--json', 'output as JSON')
  .action(() => {
    userInfo('jho stats: not implemented yet (planned: phase 5)');
    process.exit(1);
  });

statsCommand.addHelpText(
  'after',
  `
Examples:
  $ jho stats                        # full campaign snapshot
  $ jho stats --role frontend-dev    # stats for one role
  $ jho stats --since 2026-01-01     # stats since a date
  $ jho stats --json                 # JSON output
`,
);
