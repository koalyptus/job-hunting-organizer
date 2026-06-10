import { Command } from 'commander';
import { collectTags } from '../options.js';

/**
 * `jho track <url>` — record a new application (or update by slug).
 */
export const trackCommand = new Command('track')
  .description('Record a new application (or update by slug)')
  .argument('[urlOrSlug]', 'job posting URL or existing application slug')
  .option('--paste', 'paste job description from clipboard')
  .option('--stdin', 'read job description from stdin')
  .option('--status <status>', 'initial status', 'applied')
  .option('--salary <range>', 'salary or pay range')
  .option('--tag <tag>', 'add a tag (repeatable)', collectTags, [])
  .option('--note <text>', 'add a note')
  .option('--target-role <role>', 'target role for the application')
  .option('-y, --yes', 'skip confirmation prompts')
  .action(() => {
    process.stderr.write('jho track: not implemented yet (planned: phase 5)\n');
    process.exit(1);
  });

trackCommand.addHelpText(
  'after',
  `
Track a new application from a URL, or update an existing one by slug.
Use --paste or --stdin to provide the job description without a URL.

Examples:
  $ jho track https://example.com/job/123
  $ jho track https://example.com/job/123 --salary "80k-100k"
  $ jho track https://example.com/job/123 --tag urgent --tag remote
  $ jho track https://example.com/job/123 --note "Referred by Alice"
  $ jho track https://example.com/job/123 --target-role "frontend-dev"
  $ jho track --paste                                      # paste JD from clipboard
  $ jho track --stdin < job.txt                            # read JD from stdin
  $ jho track 2026-Jan-15-frontend-acme-12345 --status interview  # update existing
`,
);
