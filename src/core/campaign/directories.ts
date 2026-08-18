import { join } from 'node:path';
import { KB_GITHUB } from '../constants.js';
import { resolveCampaignRoot } from '../paths.js';
import type { FileStore } from '../../storage/types.js';
import { campaignStoreFromRoot } from '../../storage/index.js';

const KB_DIR_REL = 'knowledge-base';
const KB_GITHUB_REL = join(KB_DIR_REL, KB_GITHUB);

/** Paths created during campaign initialization. */
interface CampaignDirs {
  kbDir: string;
}

/**
 * Create the campaign directory structure through the storage port.
 * Returns the knowledge-base directory's root-relative path. The `applied/`
 * folder is created lazily by `jho track`.
 * @param campaign - Campaign folder name.
 * @param store - Optional campaign-scoped `FileStore` (for testing).
 * @returns The knowledge-base directory path info.
 */
export async function createDirectories(
  campaign: string,
  store?: FileStore,
): Promise<CampaignDirs> {
  const st = store ?? campaignStoreFromRoot(resolveCampaignRoot(campaign));
  await st.mkdir(KB_DIR_REL);
  await st.mkdir(KB_GITHUB_REL);
  return { kbDir: KB_DIR_REL };
}
