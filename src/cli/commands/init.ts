import { Command } from 'commander';
import { log as clackLog } from '@clack/prompts';
import { runInit } from '../../core/init/index.js';
import { InitCancelled, InitError } from '../../core/init/errors.js';
import { resolveCampaignName } from '../../core/paths.js';
import { getRootLogger, logError } from '../../core/logger/logger.js';

/**
 * `jho init [<name>]` — campaign creation wizard.
 */
export const initCommand = new Command('init')
  .description('Create a new campaign (wizard)')
  .argument('[name]', 'campaign name')
  .option('--cv <path>', 'path to CV file')
  .option('--linkedin <url>', 'LinkedIn profile URL')
  .option('--github <user>', 'GitHub username')
  .option('--profile <path>', 'copy existing profile.md instead of building')
  .option('--yes', 'non-interactive mode (use env vars/defaults)')
  .action(async function (name: string | undefined, opts) {
    const resolvedName = resolveCampaignName(name);
    const log = getRootLogger().child({ cmd: 'init', campaign: resolvedName });

    try {
      await runInit({
        name: resolvedName,
        cv: opts.cv as string | undefined,
        linkedin: opts.linkedin as string | undefined,
        github: opts.github as string | undefined,
        profile: opts.profile as string | undefined,
        yes: opts.yes as boolean | undefined,
        log,
      });
    } catch (err) {
      if (err instanceof InitCancelled) {
        log.debug('init.cancelled');
        clackLog.info('Init cancelled.');
        process.exit(0);
      }
      if (err instanceof InitError) {
        logError(log, err, 'init.failed', { campaign: resolvedName });
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

When run from inside a campaign folder, the campaign is inferred automatically.

Examples:
  $ jho init                                  # infer campaign from cwd, or use "default"
  $ jho init freelance                        # create/reinit named campaign
  $ jho init --cv ./cv.pdf                    # skip CV path prompt
  $ jho init --linkedin https://linkedin.com/in/user  # skip LinkedIn URL prompt
  $ jho init --profile ~/existing-profile.md  # use existing profile
  $ jho init --yes                            # non-interactive (uses env vars/defaults)
`,
);
