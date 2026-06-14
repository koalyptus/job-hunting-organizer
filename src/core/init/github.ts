import { text, password, isCancel } from '@clack/prompts';
import { InitCancelled } from './errors.js';
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
 * @throws {InitCancelled} if the user cancels any prompt.
 */
export async function promptGithub(
  defaultUser: string | undefined,
  nonInteractive: boolean,
  existingConfig: GlobalConfig | null,
): Promise<GithubResult> {
  const prefill = defaultUser ?? existingConfig?.github?.user;

  if (nonInteractive) {
    return { user: prefill, token: undefined };
  }

  const input = await text({
    message: 'GitHub username? (optional, press Enter to skip)',
    initialValue: prefill || undefined,
    placeholder: '',
  });
  if (isCancel(input)) {
    throw new InitCancelled();
  }
  const githubUser = input || undefined;

  let githubToken: string | undefined;
  if (githubUser) {
    const token = await password({
      message: 'GitHub personal access token? (optional, avoids API throttling)',
    });
    if (isCancel(token)) {
      throw new InitCancelled();
    }
    githubToken = token || undefined;
  }

  return { user: githubUser, token: githubToken };
}
