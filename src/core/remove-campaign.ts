import { rm } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { confirm, isCancel, log as clackLog } from '@clack/prompts';
import { resolveCampaignRoot, resolveDataRoot, findCampaignFromCwd, isUnder } from './paths.js';
import { pathExists } from './fs.js';
import { acquireLock } from './locks.js';
import { clearConfigCache } from './config/config.js';
import { moduleLogger } from './logger/logger.js';
import { validateName } from './validate.js';

const log = moduleLogger(import.meta.url);

/** Error thrown when removal validation or pre-flight checks fail. */
export class RemoveCampaignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RemoveCampaignError';
  }
}

/** Rejection when the campaign could not be inferred from cwd or the argument. */
export class InferCampaignError extends RemoveCampaignError {
  constructor() {
    super('could not infer campaign from cwd');
    this.name = 'InferCampaignError';
  }
}

/** Rejection when the campaign name fails validation. */
export class InvalidNameError extends RemoveCampaignError {
  /** The human-readable validation failure reason. */
  reason: string;

  constructor(name: string, reason: string) {
    super(`invalid campaign name "${name}"`);
    this.name = 'InvalidNameError';
    this.reason = reason;
  }
}

/** Rejection when removing the campaign the user is currently inside. */
export class SelfRemoveError extends RemoveCampaignError {
  constructor(name: string) {
    super(`refusing to remove campaign "${name}" while cwd is inside it`);
    this.name = 'SelfRemoveError';
  }
}

/** Rejection when the user cancels the confirmation prompt. */
export class RemoveCancelled extends Error {
  /** 'cancelled' for Ctrl+C/Esc, 'declined' for a deliberate "No". */
  reason: string;

  constructor(reason: string = 'cancelled') {
    super(reason);
    this.name = 'RemoveCancelled';
    this.reason = reason;
  }
}

/**
 * Resolve the campaign name to remove from the argument or cwd inference.
 * @param nameFlag - The campaign name passed explicitly (optional).
 * @returns The resolved campaign name.
 * @throws {InferCampaignError} if the name cannot be determined.
 */
export function resolveCampaignToRemove(nameFlag: string | undefined): string {
  const name = nameFlag?.trim() || undefined;
  if (name) {
    return name;
  }

  const inferred = findCampaignFromCwd(process.cwd(), resolveDataRoot());
  if (!inferred) {
    throw new InferCampaignError();
  }
  return inferred;
}

/**
 * Ask the user to confirm permanent removal of a campaign.
 * Throws {@link RemoveCancelled} on cancel (Ctrl+C/Esc) or decline (No).
 * @param name - The campaign name to display in the prompt.
 * @throws {RemoveCancelled} 'cancelled' on Ctrl+C/Esc, 'declined' on No.
 */
async function confirmRemoval(name: string): Promise<void> {
  clackLog.warn('This permanently deletes the campaign folder and everything in it.');
  const confirmed = await confirm({
    message: `Remove campaign "${name}"?`,
    initialValue: false,
  });

  if (isCancel(confirmed)) {
    throw new RemoveCancelled('cancelled');
  }
  if (!confirmed) {
    throw new RemoveCancelled('declined');
  }
}

/**
 * Remove a campaign folder. Validates the name, refuses if cwd is inside
 * the campaign, acquires a lock, and recursively deletes the directory.
 *
 * The operation is permanent and destructive; an interactive confirmation
 * prompt is shown unless `skipConfirm` is set (the `--yes` global flag).
 * @param name - The campaign folder name to remove.
 * @param opts.skipConfirm - Skip the confirmation prompt (used by `--yes`).
 * @throws {InvalidNameError} on validation failures.
 * @throws {SelfRemoveError} if cwd is inside the campaign.
 * @throws {RemoveCampaignError} if the campaign is not found.
 * @throws {RemoveCancelled} if the user cancels the confirmation.
 */
export async function removeCampaign(
  name: string,
  opts: { skipConfirm?: boolean } = {},
): Promise<void> {
  const validationError = validateName(name);
  if (validationError) {
    throw new InvalidNameError(name, validationError);
  }

  const campaignPath = resolveCampaignRoot(name);

  // Self-foot-gun: refuse if cwd is inside the campaign being removed.
  if (isUnder(process.cwd(), campaignPath)) {
    throw new SelfRemoveError(name);
  }

  // Pre-flight: campaign must exist (no lock needed).
  if (!(await pathExists(campaignPath))) {
    throw new RemoveCampaignError(`campaign "${name}" not found`);
  }

  if (!opts.skipConfirm) {
    await confirmRemoval(name);
  }

  const start = performance.now();
  await acquireLock(campaignPath, async () => {
    await rm(campaignPath, { recursive: true, force: true });
  });
  clearConfigCache();

  log.debug({ name, durationMs: Math.round(performance.now() - start) }, 'campaign.removed');
}
