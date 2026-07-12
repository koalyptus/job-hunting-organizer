import { Command } from 'commander';
import {
  resolveCampaignToRemove,
  removeCampaign,
  RemoveCampaignError,
  InferCampaignError,
  InvalidNameError,
  SelfRemoveError,
  RemoveCancelled,
} from '../../core/campaign/remove-campaign.js';
import { getRootLogger, logError } from '../../core/logger/logger.js';
import { userError, userSuccess, userInfo } from '../output.js';
import { bold, cyan } from '../colors.js';
import type { GlobalOpts } from '../options.js';

/**
 * `jho remove-campaign [<name>]` — permanently delete a campaign folder.
 */
export const removeCampaignCommand = new Command('remove-campaign')
  .description('Permanently remove a campaign folder')
  .argument('[name]', 'campaign name (inferred from cwd if omitted)')
  .option('-y, --yes', 'skip the confirmation prompt')
  .action(async function (name: string | undefined, opts) {
    const globals = this.parent?.opts() as GlobalOpts | undefined;
    let log = getRootLogger().child({ cmd: 'remove-campaign' });
    try {
      const campaign = resolveCampaignToRemove(name ?? globals?.campaign);
      log = log.child({ campaign });
      log.info({ campaign }, 'remove-campaign.started');
      const skipConfirm = opts.yes === true || globals?.yes === true;
      await removeCampaign(campaign, { skipConfirm });
      userSuccess(`Removed campaign ${bold(cyan(campaign))}`);
      process.exit(0);
    } catch (err) {
      if (err instanceof RemoveCancelled) {
        if (err.reason === 'declined') {
          userInfo('Campaign removal declined.');
        } else {
          userInfo('Campaign removal cancelled.');
        }
        process.exit(0);
      }
      if (err instanceof SelfRemoveError) {
        logError(log, err, 'remove-campaign.self-remove');
        log.flush();
        userError(`${err.message}\ncd out of the campaign folder first`);
        process.exit(1);
      }
      if (err instanceof InvalidNameError) {
        logError(log, err, 'remove-campaign.invalid-name', { reason: err.reason });
        log.flush();
        userError(`${err.message} — hint: ${err.reason}`);
        process.exit(1);
      }
      if (err instanceof InferCampaignError) {
        logError(log, err, 'remove-campaign.infer-failed');
        log.flush();
        userError(
          `${err.message}\nhint: pass the campaign name explicitly, or run from inside the campaign folder`,
        );
        process.exit(1);
      }
      if (err instanceof RemoveCampaignError) {
        logError(log, err, 'remove-campaign.failed');
        log.flush();
        userError(err.message);
        process.exit(1);
      }
      throw err;
    }
  });

removeCampaignCommand.addHelpText(
  'after',
  `
Permanently remove a campaign folder and all of its contents (applications,
notes, profile, and config). This is destructive and cannot be undone.

A confirmation prompt is shown unless you pass --yes.

Examples:
  $ jho remove-campaign freelance          # confirm, then delete "freelance"
  $ jho remove-campaign freelance --yes    # delete without prompting
  $ cd campaigns/freelance && jho remove-campaign  # infer name from cwd
  $ jho --campaign freelance remove-campaign --yes
`,
);
