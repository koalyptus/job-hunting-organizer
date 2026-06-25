import { Command } from 'commander';
import { userInfo } from '../output.js';

/**
 * `jho doctor [<slug>]` — diagnose the campaign.
 */
export const doctorCommand = new Command('doctor')
  .description('Diagnose the campaign or a single application (slug inferred from cwd if omitted)')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .option('--all', 'run all checks including optional ones')
  .action(() => {
    userInfo('jho doctor: not implemented yet (planned: phase 7)');
    process.exit(1);
  });

doctorCommand.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory
— run from inside an application folder (e.g. cd applied/<slug>) to skip it,
or omit it to diagnose the entire campaign.

Examples:
  $ jho doctor                                                # diagnose the campaign
  $ jho doctor --all                                          # run all checks
  $ jho doctor 2026-Jan-15-frontend-acme-12345                # diagnose one application
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho doctor  # infer from cwd
`,
);
