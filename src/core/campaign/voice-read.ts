/**
 * Lightweight voice read-only module. Reads the campaign's my-voice.md
 * file from knowledge-base/ with a fallback to a global my-voice.md
 * in the data root. No LLM or other heavy dependencies.
 */
import { readFile } from 'node:fs/promises';
import { resolveDataRoot, resolveCampaignRoot, DEFAULT_MY_VOICE_FILENAME } from '../paths.js';
import { join } from 'node:path';
import { getRootLogger } from '../logger/logger.js';
import { SECTION_SEPARATOR, VOICE_SECTION_HEADER } from '../constants.js';
import type { FileStore } from '../../storage/types.js';
import { campaignStoreFromRoot } from '../../storage/index.js';
import { StorageNotFoundError } from '../../storage/types.js';

const VOICE_PATH = join('knowledge-base', DEFAULT_MY_VOICE_FILENAME);

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
 * Read the campaign-specific voice guide from knowledge-base/my-voice.md
 * through the storage port. Returns an empty string when the file does not
 * exist; real I/O errors (EACCES, EISDIR, ...) propagate — they are not
 * treated as "missing" — so a broken voice file never silently swaps in a
 * different one.
 *
 * @param campaign - Campaign folder name.
 * @param store - Optional campaign-scoped `FileStore` (defaults to one built
 *   from the resolved campaign root). Injected by callers for testing.
 * @returns The voice markdown content, or an empty string if the file is absent.
 * @throws The underlying fs error when the file exists but cannot be read.
 */
export async function readCampaignVoiceGuide(campaign: string, store?: FileStore): Promise<string> {
  const st = store ?? campaignStoreFromRoot(resolveCampaignRoot(campaign));
  try {
    return await st.read(VOICE_PATH);
  } catch (err) {
    if (err instanceof StorageNotFoundError) {
      getRootLogger().debug({ path: VOICE_PATH }, 'voice.read.campaign_missing');
      return '';
    }
    getRootLogger().warn({ path: VOICE_PATH, err }, 'voice.read.campaign_error');
    throw err;
  }
}

/**
 * Read a user-created global voice file in the data root (optional fallback).
 * The data root is local-only by definition (see the storage plan), so this
 * reads through direct fs — it is never routed through a campaign store.
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
 * @param campaign - Campaign folder name.
 * @param store - Optional campaign-scoped `FileStore` (forwarded to
 *   {@link readCampaignVoiceGuide}).
 * @returns The voice markdown content, or an empty string if neither file exists.
 * @throws The underlying fs error when a file exists but cannot be read.
 */
export async function resolveVoiceGuide(campaign: string, store?: FileStore): Promise<string> {
  const campaignVoice = await readCampaignVoiceGuide(campaign, store);
  if (campaignVoice !== '') {
    return campaignVoice;
  }
  return readGlobalVoiceGuide();
}
