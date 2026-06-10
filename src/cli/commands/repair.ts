import { Command } from 'commander';

/**
 * `jho repair [<slug>]` — attempt auto-repair.
 */
export const repairCommand = new Command('repair')
  .description('Attempt auto-repair for the campaign (or a single application)')
  .argument('[slug]', 'application slug (optional; repairs entire campaign if omitted)')
  .option('--all', 'attempt all possible repairs')
  .action(() => {
    process.stderr.write('jho repair: not implemented yet (planned: phase 7)\n');
    process.exit(1);
  });

repairCommand.addHelpText(
  'after',
  `
The slug is optional. When omitted, the entire campaign is repaired.

Examples:
  $ jho repair                                      # repair the campaign
  $ jho repair --all                                # attempt all repairs
  $ jho repair 2026-Jan-15-frontend-acme-12345      # repair one application
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho repair
`,
);
