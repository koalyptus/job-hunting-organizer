import { text, password, isCancel, log as clackLog } from '@clack/prompts';
import { MSG_CANCELLED } from './constants.js';
import type { GlobalConfig } from '../types.js';

/** Result of the GitHub prompts step. */
export interface GithubResult {
  user: string | undefined;
  token: string | undefined;
}

/**
 * Prompt for GitHub username and optional token.
 * Pre-fills from existing config on re-init.
 * Returns `undefined` values if skipped or cancelled.
 */
export async function promptGithub(
  defaultUser: string | undefined,
  nonInteractive: boolean,
  existingConfig: GlobalConfig | null,
): Promise<GithubResult> {
  let githubUser = defaultUser ?? (existingConfig?.github?.user || undefined);

  if (!githubUser && !nonInteractive) {
    const input = await text({
      message: 'GitHub username? (optional, press Enter to skip)',
      initialValue: existingConfig?.github?.user || undefined,
      placeholder: '',
    });
    if (isCancel(input)) {
      clackLog.info(MSG_CANCELLED);
      process.exit(0);
    }
    githubUser = input || undefined;
  }

  let githubToken: string | undefined;
  if (githubUser && !nonInteractive) {
    const token = await password({
      message: 'GitHub personal access token? (optional, avoids API throttling)',
    });
    if (isCancel(token)) {
      clackLog.info(MSG_CANCELLED);
      process.exit(0);
    }
    githubToken = token || undefined;
  }

  return { user: githubUser, token: githubToken };
}
