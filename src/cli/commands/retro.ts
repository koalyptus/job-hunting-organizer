import { Command } from 'commander';

/**
 * `jho retro [<slug>]` — post-mortem for failed interviews.
 * Slug is optional; inferred from cwd when omitted.
 */
export const retroCommand = new Command('retro')
  .description('Post-mortem for failed interviews (slug inferred from cwd if omitted)')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .option('--show', 'display the most recent retro')
  .option('--interview <index>', 'retro for a specific interview index')
  .option('--append', 'append notes to the existing retro')
  .option('--aggregate', 'show recurring weak topics across all apps')
  .option('--role <slug>', 'scope to a single target role (with --aggregate)')
  .option('--include-abandoned', 'also count weak topics from abandoned apps')
  .action(() => {
    process.stderr.write('jho retro: not implemented yet (planned: phase 7)\n');
    process.exit(1);
  });

retroCommand.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory
— run from inside an application folder (e.g. cd applied/<slug>) to skip it.

Examples:
  $ jho retro                                         # generate retro for current app (infer slug)
  $ jho retro --show                                  # show most recent retro
  $ jho retro --interview 2                           # retro for interview #2
  $ jho retro --append                                # add notes to existing retro
  $ jho retro --aggregate                             # recurring weak topics across all apps
  $ jho retro 2026-Jan-15-frontend-acme-12345         # explicit slug
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho retro
`,
);
