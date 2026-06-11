import { copyFile } from 'node:fs/promises';
import { log as clackLog } from '@clack/prompts';
import { resolveProfilePath } from '../paths.js';
import { pathExists, atomicWrite } from '../fs.js';
import { buildProfile } from '../profile.js';
import { parseTargetRoles, replaceTargetRoles } from '../target-roles.js';
import { withSpinner } from '../../cli/spinner.js';
import { childLogger } from '../logger.js';
import type { LlmConfig } from '../types.js';
import { reviewRoles } from './roles.js';
import { generateSkeletonProfile } from './skeleton.js';

const log = childLogger({ cmd: 'init' });

/**
 * Handle profile creation: copy, auto-build, or skeleton.
 * Returns the profile content that was written.
 */
export async function handleProfile(opts: {
  campaignRoot: string;
  profileFlag: string | undefined;
  cvPath: string | undefined;
  githubUser: string | undefined;
  githubToken: string | undefined;
  llmConfig: LlmConfig | undefined;
  nonInteractive: boolean;
}): Promise<string> {
  const profilePath = resolveProfilePath(opts.campaignRoot);

  if (opts.profileFlag) {
    // --profile: copy existing file
    if (!(await pathExists(opts.profileFlag))) {
      clackLog.error(`Profile file not found: ${opts.profileFlag}`);
      process.exit(1);
    }

    try {
      await copyFile(opts.profileFlag, profilePath);
    } catch (err) {
      clackLog.error(`Failed to copy profile: ${(err as Error).message}`);
      process.exit(1);
    }

    clackLog.success(`Copied profile from ${opts.profileFlag}`);
    return '(copied)';
  }

  if (opts.cvPath && opts.llmConfig) {
    // Auto-build profile
    const profile = await withSpinner('Building profile from CV + GitHub...', 'Profile built', () =>
      buildProfile({
        cvPath: opts.cvPath!,
        githubUser: opts.githubUser ?? '',
        githubToken: opts.githubToken,
        llmConfig: opts.llmConfig!,
        campaignRoot: opts.campaignRoot,
        log,
      }),
    );

    let profileContent = profile.content;

    // Parse and review target roles
    const roles = parseTargetRoles(profileContent);

    if (roles.length > 0 && !opts.nonInteractive) {
      const reviewed = await reviewRoles(roles);
      profileContent = replaceTargetRoles(profileContent, reviewed);
    }

    await atomicWrite(profilePath, profileContent);
    clackLog.success('Profile written');
    return profileContent;
  }

  // Skeleton profile
  const skeleton = generateSkeletonProfile(opts.githubUser ?? '');
  await atomicWrite(profilePath, skeleton);
  clackLog.warn('Profile auto-generation skipped (CV or LLM not provided)');
  clackLog.info(`A skeleton profile.md has been created at ${profilePath}`);
  clackLog.info(
    'Edit it with your details, or re-run with --cv and an LLM configured to auto-generate.',
  );
  return skeleton;
}
