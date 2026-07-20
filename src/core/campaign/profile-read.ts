/**
 * Lightweight profile read-only module. Contains only the error class
 * and the simple file-read helper — no LLM, CV, or GitHub imports.
 */
import { readFile } from 'node:fs/promises';
import { resolveProfilePath } from '../paths.js';
import { getRootLogger } from '../logger/logger.js';

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
 * Read the profile file for a campaign. Returns the file content as a string.
 * @param campaignRoot - Absolute path to the campaign root directory.
 * @returns The profile markdown content.
 * @throws {ProfileReadError} if the file does not exist or cannot be read.
 */
export async function readProfile(campaignRoot: string): Promise<string> {
  const profilePath = resolveProfilePath(campaignRoot);
  try {
    return await readFile(profilePath, 'utf8');
  } catch {
    getRootLogger().warn({ path: profilePath }, 'profile.read.missing');
    throw new ProfileReadError(`no profile found at ${profilePath}`);
  }
}
