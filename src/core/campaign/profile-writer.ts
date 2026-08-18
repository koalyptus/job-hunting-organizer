import { computeHash } from '../toolhash.js';
import { resolveCampaignRoot } from '../paths.js';
import { getRootLogger } from '../logger/logger.js';
import type { FileStore } from '../../storage/types.js';
import { campaignStoreFromRoot } from '../../storage/index.js';

export class ProfileWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileWriteError';
  }
}

const PROFILE_PATH = 'profile.md';
const PROFILE_TOOLHASH_PATH = 'profile.md.toolhash';

/**
 * Write the profile markdown for a campaign through the storage port.
 *
 * The store root is the campaign directory, so `profile.md` is its own
 * root-relative `StoragePath`. The write is wrapped in the store's
 * `withLock` (keyed on the profile file) so concurrent writers serialize
 * the same way the former `acquireLock(campaignRoot)` did. On success the
 * `profile.md.toolhash` sidecar is written through the port as well.
 *
 * @param campaign - Campaign folder name.
 * @param content - The profile markdown content.
 * @param store - Optional campaign-scoped `FileStore` (defaults to one built
 *   from the resolved campaign root). Injected by callers for testing.
 * @returns `true` on success.
 * @throws {ProfileWriteError} if the write fails.
 */
export async function writeProfile(
  campaign: string,
  content: string,
  store?: FileStore,
): Promise<boolean> {
  const st = store ?? campaignStoreFromRoot(resolveCampaignRoot(campaign));

  return st.withLock(PROFILE_PATH, async () => {
    try {
      await st.write(PROFILE_PATH, content);
      await st.write(PROFILE_TOOLHASH_PATH, `${computeHash(content)}\n`);
      return true;
    } catch (err) {
      getRootLogger().error({ path: PROFILE_PATH, err }, 'profile.write.failed');
      throw new ProfileWriteError(`failed to write profile to ${PROFILE_PATH}`);
    }
  });
}
