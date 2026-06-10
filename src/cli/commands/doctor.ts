import { Command } from 'commander';

/**
 * `jho doctor [<slug>]` — diagnose the campaign.
 */
export const doctorCommand = new Command('doctor')
  .description('Diagnose the campaign (or a single application)')
  .argument('[slug]', 'application slug (optional; diagnoses entire campaign if omitted)')
  .option('--all', 'run all checks including optional ones')
  .action(() => {
    process.stderr.write('jho doctor: not implemented yet (planned: phase 7)\n');
    process.exit(1);
  });

doctorCommand.addHelpText(
  'after',
  `
The slug is optional. When omitted, the entire campaign is diagnosed.

Examples:
  $ jho doctor                                      # diagnose the campaign
  $ jho doctor --all                                # run all checks
  $ jho doctor 2026-Jan-15-frontend-acme-12345      # diagnose one application
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho doctor
`,
);
