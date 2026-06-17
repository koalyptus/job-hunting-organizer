import { rename } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resolveCampaignRoot, resolveDataRoot, findCampaignFromCwd, isUnder } from './paths.js';
import { pathExists } from './fs.js';
import { acquireLock } from './locks.js';
import { clearConfigCache } from './config.js';
import { childLogger } from './logger.js';
import { validateName } from './validate.js';

const log = childLogger({ cmd: 'rename-campaign' });

/** Error thrown when rename validation or pre-flight checks fail. */
export class RenameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RenameError';
  }
}

/**
 * Resolve the old campaign name from the `--from` flag or cwd inference.
 * @returns The resolved old campaign name.
 * @throws {RenameError} if the name cannot be determined.
 */
export function resolveOldName(fromFlag: string | undefined): string {
  const oldName = fromFlag?.trim() || undefined;
  if (oldName) {
    return oldName;
  }

  const inferred = findCampaignFromCwd(process.cwd(), resolveDataRoot());
  if (!inferred) {
    throw new RenameError(
      'could not infer campaign from cwd\nhint: pass the campaign name explicitly with --from, or run from inside the campaign folder',
    );
  }
  return inferred;
}

/**
 * Rename a campaign folder. Validates the new name, acquires a lock,
 * and performs an atomic rename.
 * @throws {RenameError} on validation or pre-flight failures.
 */
export async function renameCampaign(oldName: string, newName: string): Promise<void> {
  const validationError = validateName(newName);
  if (validationError) {
    throw new RenameError(`invalid campaign name "${newName}"\nhint: ${validationError}`);
  }

  const oldPath = resolveCampaignRoot(oldName);
  const newPath = resolveCampaignRoot(newName);

  // Self-foot-gun: refuse if cwd is inside the campaign being renamed
  if (isUnder(process.cwd(), oldPath)) {
    throw new RenameError(
      `cannot rename the campaign you are currently in\nhint: cd out of campaigns/${oldName} first`,
    );
  }

  // Pre-flight: source must exist (no lock needed)
  if (!(await pathExists(oldPath))) {
    throw new RenameError(`campaign "${oldName}" not found`);
  }

  const start = performance.now();
  await acquireLock(oldPath, async () => {
    // Destination check must be inside the lock to prevent TOCTOU.
    if (await pathExists(newPath)) {
      throw new RenameError(`campaign "${newName}" already exists`);
    }
    await rename(oldPath, newPath);
  });
  clearConfigCache();

  log.debug(
    { old: oldName, new: newName, durationMs: Math.round(performance.now() - start) },
    'campaign.renamed',
  );
}
