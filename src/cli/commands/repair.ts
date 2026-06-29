import { Command } from 'commander';
import { userWarn } from '../output.js';

/**
 * `jho repair [<slug>]` — attempt auto-repair.
 */
export const repairCommand = new Command('repair')
  .description(
    'Attempt auto-repair for the campaign or a single application (slug inferred from cwd if omitted)',
  )
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .option('--all', 'attempt all possible repairs')
  .action(() => {
    userWarn('jho repair: not implemented yet (planned: phase 7)');
    process.exit(1);
  });

repairCommand.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory
— run from inside an application folder (e.g. cd applied/<slug>) to skip it,
or omit it to repair the entire campaign.

Examples:
  $ jho repair                                                # repair the campaign
  $ jho repair --all                                          # attempt all repairs
  $ jho repair 2026-Jan-15-frontend-acme-12345                # repair one application
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho repair  # infer from cwd
`,
);
