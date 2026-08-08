/**
 * Lightweight voice read-only module. Reads the campaign's my-voice.md
 * file from knowledge-base/ with a fallback to a global my-voice.md
 * in the data root. No LLM or other heavy dependencies.
 */
import { readFile } from 'node:fs/promises';
import { resolveMyVoicePath, resolveDataRoot, DEFAULT_MY_VOICE_FILENAME } from '../paths.js';
import { join } from 'node:path';
import { getRootLogger } from '../logger/logger.js';
import { SECTION_SEPARATOR, VOICE_SECTION_HEADER } from '../constants.js';

/**
 * Append the personal voice guide section to an LLM prompt's message parts
 * array when voice content is present. Shared by every prompt-building
 * orchestrator so the section shape stays in one place.
 *
 * @param messageParts - The message parts array being built for the prompt.
 * @param voice - The voice guide content (empty string skips the section).
 */
export function appendVoiceSection(messageParts: string[], voice: string): void {
  if (voice) {
    messageParts.push('', SECTION_SEPARATOR, '', VOICE_SECTION_HEADER, '', voice);
  }
}

/**
 * Whether an fs error means the file genuinely does not exist. Only these
 * errors trigger the fallback chain; permission or directory errors surface
 * instead of silently substituting a different voice file.
 * @param err - The error thrown by a readFile call.
 */
function isMissingFile(err: unknown): boolean {
  return err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

/**
 * Read the campaign-specific voice guide from knowledge-base/my-voice.md.
 * Returns an empty string when the file does not exist; real I/O errors
 * (EACCES, EISDIR, ...) propagate — they are not treated as "missing" —
 * so a broken voice file never silently swaps in a different one.
 *
 * @param campaignRoot - Absolute path to the campaign root directory.
 * @returns The voice markdown content, or an empty string if the file is absent.
 * @throws The underlying fs error when the file exists but cannot be read.
 */
export async function readCampaignVoiceGuide(campaignRoot: string): Promise<string> {
  const campaignVoicePath = resolveMyVoicePath(campaignRoot);
  try {
    return await readFile(campaignVoicePath, 'utf8');
  } catch (err) {
    if (!isMissingFile(err)) {
      getRootLogger().warn({ path: campaignVoicePath, err }, 'voice.read.campaign_error');
      throw err;
    }
    getRootLogger().debug({ path: campaignVoicePath }, 'voice.read.campaign_missing');
    return '';
  }
}

/**
 * Read a user-created global voice file in the data root (optional fallback).
 * Returns an empty string when the file does not exist; real I/O errors
 * propagate for the same reason as {@link readCampaignVoiceGuide}.
 *
 * @returns The voice markdown content, or an empty string if the file is absent.
 * @throws The underlying fs error when the file exists but cannot be read.
 */
export async function readGlobalVoiceGuide(): Promise<string> {
  const dataRoot = resolveDataRoot();
  const globalVoicePath = join(dataRoot, DEFAULT_MY_VOICE_FILENAME);
  try {
    return await readFile(globalVoicePath, 'utf8');
  } catch (err) {
    if (!isMissingFile(err)) {
      getRootLogger().warn({ path: globalVoicePath, err }, 'voice.read.global_error');
      throw err;
    }
    getRootLogger().debug({ path: globalVoicePath }, 'voice.read.global_missing');
    return '';
  }
}

/**
 * Resolve the voice guide for a campaign: prefer the campaign-specific
 * my-voice.md in knowledge-base/, fall back to the global my-voice.md in
 * the data root, and return an empty string when neither exists.
 *
 * @param campaignRoot - Absolute path to the campaign root directory.
 * @returns The voice markdown content, or an empty string if neither file exists.
 * @throws The underlying fs error when a file exists but cannot be read.
 */
export async function resolveVoiceGuide(campaignRoot: string): Promise<string> {
  const campaignVoice = await readCampaignVoiceGuide(campaignRoot);
  if (campaignVoice !== '') {
    return campaignVoice;
  }
  return readGlobalVoiceGuide();
}
