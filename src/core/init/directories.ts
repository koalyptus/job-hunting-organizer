import { join } from 'node:path';
import { resolveAppliedDir, resolveKnowledgeBaseDir, ensureRoot } from '../paths.js';
import { KB_LOCAL, KB_CV, KB_GITHUB } from './constants.js';

/** Paths created during campaign initialization. */
export interface CampaignDirs {
  appliedDir: string;
  kbDir: string;
}

/**
 * Create the campaign directory structure.
 * Returns the applied and knowledge-base directory paths.
 */
export async function createDirectories(campaignRoot: string): Promise<CampaignDirs> {
  const appliedDir = resolveAppliedDir(campaignRoot);
  const kbDir = resolveKnowledgeBaseDir(campaignRoot);
  const kbLocalDir = join(kbDir, KB_LOCAL);
  const kbCvDir = join(kbLocalDir, KB_CV);
  const kbGithubDir = join(kbLocalDir, KB_GITHUB);

  // Ensure all directories exist (created recursively if missing).
  // campaignRoot first (parent), then children in parallel.
  await ensureRoot(campaignRoot);
  await Promise.all([ensureRoot(appliedDir), ensureRoot(kbCvDir), ensureRoot(kbGithubDir)]);

  return { appliedDir, kbDir };
}
