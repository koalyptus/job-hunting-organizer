import { Command } from 'commander';
import { resolveCampaignRoot } from '../../core/paths.js';
import { readProfile, ProfileReadError } from '../../core/profile.js';
import type { GlobalOpts } from '../options.js';
import { getRootLogger, logError } from '../../core/logger/logger.js';

/**
 * `jho profile show` — print the current profile.
 */
const showCommand = new Command('show')
  .description('Print the current profile')
  .action(async function () {
    const globals = this.parent?.parent?.opts() as GlobalOpts | undefined;
    const campaign = globals?.campaign ?? 'default';
    const log = getRootLogger().child({ cmd: 'profile.show', campaign });
    try {
      log.info({ campaign }, 'profile.show.started');
      const content = await readProfile(resolveCampaignRoot(campaign));
      process.stdout.write(content);
      log.info({ campaign }, 'profile.show.completed');
    } catch (err) {
      if (err instanceof ProfileReadError) {
        logError(log, err, 'profile.read.failed', { campaign });
        process.stderr.write(`jho profile show: ${err.message}\n`);
        process.exit(1);
      }
      throw err;
    }
  });

showCommand.addHelpText(
  'after',
  `
Examples:
  $ jho profile show                        # default campaign
  $ jho --campaign freelance profile show   # specific campaign
`,
);

/**
 * `jho profile rebuild` — regenerate profile from CV + GitHub (stub).
 */
const rebuildCommand = new Command('rebuild')
  .description('Regenerate profile from CV + GitHub')
  .option('--cv <path>', 'path to CV file')
  .option('--github <user>', 'GitHub username')
  .action(() => {
    process.stderr.write('jho profile rebuild: not implemented yet (planned: phase 4c)\n');
    process.exit(1);
  });

/**
 * `jho profile [show|rebuild]` — manage the candidate profile.
 */
export const profileCommand = new Command('profile')
  .description('Show or rebuild the candidate profile')
  .addCommand(showCommand)
  .addCommand(rebuildCommand);

profileCommand.addHelpText(
  'after',
  `
Examples:
  $ jho profile show         # print the profile
  $ jho profile rebuild      # regenerate from CV + GitHub
`,
);
