import { Command } from 'commander';

/**
 * `jho cover-letter [<slug>|<url>]` — generate a tailored cover letter.
 * Slug is optional; inferred from cwd when omitted.
 */
export const coverLetterCommand = new Command('cover-letter')
  .description('Generate a tailored cover letter (slug inferred from cwd if omitted)')
  .argument('[slugOrUrl]', 'application slug or job posting URL')
  .option('--save', 'save to cover-letter.md in the application folder')
  .option('--paste', 'copy to clipboard')
  .option('--out <path>', 'write to a file')
  .action(() => {
    process.stderr.write('jho cover-letter: not implemented yet (planned: phase 6)\n');
    process.exit(1);
  });

coverLetterCommand.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory
— run from inside an application folder (e.g. cd applied/<slug>) to skip it.

Pass a URL to generate a cover letter for a job you haven't tracked yet.

Examples:
  $ jho cover-letter                                        # infer slug from cwd, print to stdout
  $ jho cover-letter --save                                 # save to application folder
  $ jho cover-letter --paste                                # copy to clipboard
  $ jho cover-letter --out ~/Desktop/cover-letter.md        # write to file
  $ jho cover-letter 2026-Jan-15-frontend-acme-12345        # explicit slug
  $ jho cover-letter https://example.com/job/123            # from URL (ad-hoc)
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho cover-letter --save
`,
);
