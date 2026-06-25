import { Command } from 'commander';
import { userInfo } from '../output.js';

/**
 * `jho prepare [<slug>|<url>]` — pre-interview prep plan.
 * Slug is optional; inferred from cwd when omitted.
 */
export const prepareCommand = new Command('prepare')
  .description('Generate a pre-interview prep plan (slug inferred from cwd if omitted)')
  .argument('[slugOrUrl]', 'application slug or job posting URL')
  .option('--update', 'update an existing prep plan')
  .option('--add <topic>', 'add a topic to brush up on')
  .option('--text <text>', 'paste job description text (ad-hoc, prints to stdout)')
  .option('--days <n>', 'number of days until the interview', '7')
  .option('--json', 'output as JSON')
  .action(() => {
    userInfo('jho prepare: not implemented yet (planned: phase 7)');
    process.exit(1);
  });

prepareCommand.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory
— run from inside an application folder (e.g. cd applied/<slug>) to skip it.

Ad-hoc modes (print to stdout, don't save):
  jho prepare <url>            extract JD from URL, print prep plan
  jho prepare --text "..."     paste JD text, print prep plan

Examples:
  $ jho prepare                                             # generate prep plan (infer slug from cwd)
  $ jho prepare --days 7                                    # prep for interview in 7 days
  $ jho prepare --add "React hooks"                         # add a topic
  $ jho prepare --update                                    # update existing plan
  $ jho prepare --json                                      # JSON output
  $ jho prepare 2026-Jan-15-frontend-acme-12345             # explicit slug
  $ jho prepare https://example.com/job/123                 # ad-hoc from URL
  $ jho prepare --text "We need a senior React dev..."      # ad-hoc from pasted text
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho prepare
`,
);
