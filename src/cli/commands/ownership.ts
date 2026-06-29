import { Command } from 'commander';
import { renderOwnership } from '../../core/ownership.js';
import { cliColorize } from '../colors.js';

/**
 * `jho ownership [--markdown]` — print the file ownership table.
 */
export const ownershipCommand = new Command('ownership')
  .description('Print the file ownership table')
  .option('--markdown', 'output as a markdown table')
  .action(function (opts) {
    process.stdout.write(
      renderOwnership({
        markdown: opts.markdown as boolean | undefined,
        colorize: cliColorize,
      }),
    );
  });

ownershipCommand.addHelpText(
  'after',
  `
Examples:
  $ jho ownership                # console table
  $ jho ownership --markdown     # markdown table for docs
`,
);
