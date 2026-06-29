import { Command } from 'commander';
import { userWarn } from '../output.js';

/**
 * `jho show [<slug>]` — show one application.
 * Slug is optional; inferred from cwd when omitted.
 */
export const showCommand = new Command('show')
  .description('Show one application (slug inferred from cwd if omitted)')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .action(() => {
    userWarn('jho show: not implemented yet (planned: phase 7)');
    process.exit(1);
  });

showCommand.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory
— run from inside an application folder (e.g. cd applied/<slug>) to skip it.

Examples:
  $ jho show                                                  # infer slug from cwd
  $ jho show 2026-Jan-15-frontend-acme-12345                  # explicit slug
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho show    # infer from cwd
`,
);
