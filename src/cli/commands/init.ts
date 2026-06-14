import { Command } from 'commander';
import { log as clackLog } from '@clack/prompts';
import { runInit } from '../../core/init/index.js';
import { InitCancelled, InitError } from '../../core/init/errors.js';

/**
 * `jho init [<name>]` — campaign creation wizard.
 */
export const initCommand = new Command('init')
  .description('Create a new campaign (wizard)')
  .argument('[name]', 'campaign name', 'default')
  .option('--cv <path>', 'path to CV file')
  .option('--github <user>', 'GitHub username')
  .option('--profile <path>', 'copy existing profile.md instead of building')
  .option('--yes', 'non-interactive mode (use env vars/defaults)')
  .action(async function (name: string, opts) {
    try {
      await runInit({
        name,
        cv: opts.cv as string | undefined,
        github: opts.github as string | undefined,
        profile: opts.profile as string | undefined,
        yes: opts.yes as boolean | undefined,
      });
    } catch (err) {
      if (err instanceof InitCancelled) {
        clackLog.info('Init cancelled.');
        process.exit(0);
      }
      if (err instanceof InitError) {
        process.stderr.write(`error: ${err.message}\n`);
        process.exit(1);
      }
      throw err;
    }
  });

initCommand.addHelpText(
  'after',
  `
Create a new campaign with a profile built from your CV and GitHub.

Examples:
  $ jho init                  # default campaign (interactive)
  $ jho init freelance        # named campaign
  $ jho init --cv ./cv.pdf    # skip CV path prompt
  $ jho init --profile ~/existing-profile.md  # use existing profile
  $ jho init --yes            # non-interactive (uses env vars/defaults)
`,
);
