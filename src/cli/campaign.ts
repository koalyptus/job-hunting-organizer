import { log as clackLog } from '@clack/prompts';
import type { GlobalOpts } from './options.js';
import { resolveCampaignInteractive, CampaignPickerCancelled } from '../core/campaign.js';

export { CampaignPickerCancelled };

/**
 * Resolve the campaign for a CLI command, prompting the user interactively
 * when more than one campaign exists and none is specified. Wraps
 * {@link resolveCampaignInteractive} with the global `--yes` flag so callers
 * do not have to thread it through manually.
 *
 * A cancelled prompt (Ctrl+C / "Cancel" in the select menu) exits the process
 * with code 0, mirroring other cancel flows — so callers do not need their own
 * `CampaignPickerCancelled` handling and may resolve the campaign before their
 * `try` block.
 *
 * @param globals - Parsed global options (holds `--campaign` and `--yes`).
 * @returns The resolved campaign name.
 */
export async function resolveCampaignCli(globals: GlobalOpts | undefined): Promise<string> {
  try {
    return await resolveCampaignInteractive(globals?.campaign, { yes: globals?.yes });
  } catch (err) {
    if (err instanceof CampaignPickerCancelled) {
      clackLog.info('Campaign picker cancelled.');
      process.exit(0);
    }
    throw err;
  }
}
