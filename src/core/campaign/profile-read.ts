/**
 * Lightweight profile read-only module. Contains only the error class
 * and the simple file-read helper — no LLM, CV, or GitHub imports.
 */
import { resolveCampaignRoot } from '../paths.js';
import { getRootLogger } from '../logger/logger.js';
import type { FileStore } from '../../storage/types.js';
import { campaignStoreFromRoot } from '../../storage/index.js';
import { StorageNotFoundError } from '../../storage/types.js';

const PROFILE_PATH = 'profile.md';

/**
 * Error thrown when the profile file cannot be read.
 */
export class ProfileReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileReadError';
  }
}

/**
 * Read the profile file for a campaign through the storage port.
 * @param campaign - Campaign folder name.
 * @param store - Optional campaign-scoped `FileStore` (defaults to one built
 *   from the resolved campaign root). Injected by callers for testing.
 * @returns The profile markdown content.
 * @throws {ProfileReadError} if the file does not exist or cannot be read.
 */
export async function readProfile(campaign: string, store?: FileStore): Promise<string> {
  const st = store ?? campaignStoreFromRoot(resolveCampaignRoot(campaign));
  try {
    return await st.read(PROFILE_PATH);
  } catch (err) {
    if (err instanceof StorageNotFoundError) {
      getRootLogger().warn({ path: PROFILE_PATH }, 'profile.read.missing');
      throw new ProfileReadError(`no profile found at ${PROFILE_PATH}`);
    }
    throw err;
  }
}
