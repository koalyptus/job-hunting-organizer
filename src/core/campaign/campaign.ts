import { select, isCancel } from '@clack/prompts';
import {
  getDefaultCampaignName,
  listCampaigns,
  resolveCampaignName,
  resolveDataRoot,
} from '../paths.js';
import type { CampaignListing } from '../types.js';

/**
 * Thrown when the user cancels the campaign picker (e.g. Ctrl+C or selecting
 * "Cancel" in the select menu). The CLI layer should exit with code 0,
 * mirroring {@link InitCancelled} from the init wizard.
 */
export class CampaignPickerCancelled extends Error {
  constructor() {
    super('Campaign picker cancelled.');
    this.name = 'CampaignPickerCancelled';
  }
}

/**
 * Options controlling interactive campaign resolution.
 */
export interface ResolveCampaignInteractiveOptions {
  /** Skip the picker and fall back to the default/sole campaign. */
  yes?: boolean;
  /**
   * Whether the process is attached to an interactive terminal. When
   * `false` (piped input, CI, cron, redirected output) the picker is
   * skipped so it can never block waiting for input that will never
   * arrive. Defaults to `process.stdin.isTTY`.
   */
  tty?: boolean;
}

/**
 * Resolve the campaign to operate on, prompting the user interactively when
 * more than one campaign exists and none is specified explicitly.
 *
 * Resolution order:
 * 1. An explicit `--campaign <name>` always wins and never prompts.
 * 2. cwd inference (`resolveCampaignName`) — unchanged behaviour.
 * 3. When exactly one campaign exists it is auto-selected (no prompt).
 * 4. When more than one campaign exists and we are on a TTY (and not
 *    `--yes`), prompt the user to pick one via {@link selectCampaign}.
 * 5. Otherwise fall back to the default campaign name, honouring
 *    `JHO_DEFAULT_CAMPAIGN` (the literal `'default'` when unset).
 *
 * @param explicitName - Campaign name passed via `--campaign`, if any.
 * @param opts - Interactive resolution controls.
 * @returns The resolved campaign name.
 * @throws {CampaignPickerCancelled} when the user cancels the prompt.
 */
export async function resolveCampaignInteractive(
  explicitName: string | undefined,
  opts: ResolveCampaignInteractiveOptions = {},
): Promise<string> {
  // 1. Explicit name wins — no prompt.
  if (explicitName) {
    return explicitName;
  }

  // 2. cwd inference (unchanged).
  const fallback = getDefaultCampaignName();
  const inferred = resolveCampaignName(undefined);
  const isDefault = inferred === fallback;
  if (!isDefault) {
    return inferred;
  }

  // 3/5. No prompt unless interactive and requested.
  const tty = opts.tty ?? process.stdin.isTTY ?? false;
  if (opts.yes === true || tty === false) {
    return fallback;
  }

  const campaigns = await listCampaigns(resolveDataRoot());
  if (campaigns.length <= 1) {
    return campaigns[0]?.name ?? fallback;
  }

  return selectCampaign(campaigns);
}

/**
 * Prompt the user to choose a campaign using `@clack/prompts`.
 *
 * @param campaigns - Campaigns to choose from (already sorted by name).
 * @returns The chosen campaign name.
 * @throws {CampaignPickerCancelled} when the user cancels.
 */
async function selectCampaign(campaigns: CampaignListing[]): Promise<string> {
  const choice = await select<string>({
    message: 'Select a campaign:',
    options: campaigns.map((c) => ({
      value: c.name,
      label: c.name,
      hint: `${c.applicationCount} ${c.applicationCount === 1 ? 'app' : 'apps'}`,
    })),
  });

  if (isCancel(choice)) {
    throw new CampaignPickerCancelled();
  }

  return choice;
}
