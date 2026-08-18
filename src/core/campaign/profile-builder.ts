import { readFile } from 'node:fs/promises';
import { log as clackLog } from '@clack/prompts';
import type { Logger } from 'pino';
import { resolveProfilePath } from '../paths.js';
import { pathExists } from '../fs.js';
import { buildProfile } from './profile-build.js';
import { extractTargetRoles, replaceTargetRoles } from './target-roles.js';
import { withSpinner } from '../spinner.js';
import type { LlmConfig } from '../types.js';
import { reviewRoles } from './roles.js';
import { generateSkeletonProfile } from '../init/skeleton.js';
import { InitError } from '../init/errors.js';
import { moduleLogger } from '../logger/logger.js';
import type { FileStore } from '../../storage/types.js';
import { campaignStoreFromRoot } from '../../storage/index.js';

const fallbackLog = moduleLogger(import.meta.url);

function log(opts: { log?: Logger }): Logger {
  return opts.log ?? fallbackLog;
}

/**
 * Handle profile creation: copy, auto-build, or skeleton.
 * Returns the profile content that was written.
 * @throws {InitError} if the profile file is missing or copy fails.
 */
export async function handleProfile(opts: {
  campaignRoot: string;
  profileFlag: string | undefined;
  cvPath: string | undefined;
  githubUser: string | undefined;
  githubToken: string | undefined;
  linkedinUrl: string | undefined;
  llmConfig: LlmConfig | undefined;
  nonInteractive: boolean;
  /** Optional character cap for knowledge-base context (forwarded to buildProfile). */
  maxChars?: number;
  log?: Logger;
  /** Optional campaign-scoped `FileStore` (for testing). */
  store?: FileStore;
}): Promise<string> {
  const st = opts.store ?? campaignStoreFromRoot(opts.campaignRoot);
  const profilePath = resolveProfilePath(opts.campaignRoot);

  if (opts.profileFlag) {
    // --profile: copy existing file
    log(opts).info({ from: opts.profileFlag }, 'profile.copy.started');
    if (!(await pathExists(opts.profileFlag))) {
      throw new InitError(`Profile file not found: ${opts.profileFlag}`);
    }

    try {
      const content = await readFile(opts.profileFlag);
      await st.write('profile.md', content);
    } catch (err) {
      throw new InitError(`Failed to copy profile: ${(err as Error).message}`);
    }

    clackLog.success(`Copied profile from ${opts.profileFlag}`);
    log(opts).info({ from: opts.profileFlag }, 'profile.copy.completed');
    return '(copied)';
  }

  if (opts.llmConfig) {
    log(opts).info({ hasCv: !!opts.cvPath, githubUser: opts.githubUser }, 'profile.build.started');
    // Auto-build profile (no logger — debug logs confuse end users)
    let profile;
    try {
      profile = await withSpinner(
        'Building profile...',
        'Profile built',
        () =>
          buildProfile({
            cvPath: opts.cvPath,
            githubUser: opts.githubUser ?? '',
            githubToken: opts.githubToken,
            linkedinUrl: opts.linkedinUrl,
            llmConfig: opts.llmConfig!,
            campaignRoot: opts.campaignRoot,
            maxChars: opts.maxChars,
            log: opts.log,
          }),
        'Profile build failed',
      );
    } catch (err) {
      const msg = (err as Error).message ?? 'unknown error';
      const isTimeout = /timed?\s*out/i.test(msg);
      const hint = isTimeout
        ? ' — the LLM request timed out. Increase llm.timeoutMs in config.json, or use a faster model'
        : '';
      throw new InitError(`Profile build failed: ${msg}${hint}`);
    }

    let profileContent = profile.content;

    // Parse and review target roles
    const roles = extractTargetRoles(profileContent);

    if (roles.length > 0 && !opts.nonInteractive) {
      const reviewed = await reviewRoles(roles);
      profileContent = replaceTargetRoles(profileContent, reviewed);
    }

    await st.write('profile.md', profileContent);
    clackLog.success('Profile written');
    log(opts).info({ profilePath }, 'profile.build.completed');
    return profileContent;
  }

  // Skeleton profile
  log(opts).info('profile.skeleton.started');
  const skeleton = generateSkeletonProfile(opts.githubUser ?? '', opts.linkedinUrl ?? '');
  await st.write('profile.md', skeleton);
  clackLog.warn('Profile auto-generation skipped (LLM not configured)');
  clackLog.info(`A skeleton profile.md has been created at ${profilePath}`);
  clackLog.info('Edit it with your details, or re-run with an LLM configured to auto-generate.');
  log(opts).info({ profilePath }, 'profile.skeleton.completed');
  return skeleton;
}
