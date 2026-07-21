import { atomicWrite } from '../fs.js';
import { resolveCampaignRoot, resolveProfilePath } from '../paths.js';
import { computeHash, writeToolhash } from '../toolhash.js';
import { acquireLock } from '../locks.js';
import { getRootLogger } from '../logger/logger.js';

export class ProfileWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileWriteError';
  }
}

export async function writeProfile(campaign: string, content: string): Promise<boolean> {
  const campaignRoot = resolveCampaignRoot(campaign);
  const profilePath = resolveProfilePath(campaignRoot);
  return acquireLock(campaignRoot, async () => {
    const written = await atomicWrite(profilePath, content);
    if (!written) {
      getRootLogger().error({ path: profilePath }, 'profile.write.failed');
      throw new ProfileWriteError(`failed to write profile to ${profilePath}`);
    }
    await writeToolhash(profilePath, computeHash(content));
    return true;
  });
}
