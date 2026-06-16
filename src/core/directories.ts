import { join } from 'node:path';
import { resolveKnowledgeBaseDir, ensureRoot } from './paths.js';
import { KB_GITHUB } from './constants.js';

/** Paths created during campaign initialization. */
export interface CampaignDirs {
  kbDir: string;
}

/**
 * Create the campaign directory structure.
 * Returns the knowledge-base directory path.
 * The `applied/` folder is created lazily by `jho track`.
 */
export async function createDirectories(campaignRoot: string): Promise<CampaignDirs> {
  const kbDir = resolveKnowledgeBaseDir(campaignRoot);
  const kbGithubDir = join(kbDir, KB_GITHUB);

  // Ensure all directories exist (created recursively if missing).
  // campaignRoot first (parent), then children in parallel.
  await ensureRoot(campaignRoot);
  await ensureRoot(kbGithubDir);

  return { kbDir };
}
