import { text, isCancel, log as clackLog } from '@clack/prompts';
import type { Logger } from 'pino';
import { loadCampaignConfig } from '../config/config.js';
import { validateCvPath } from '../cv.js';
import { JHO_LINKEDIN_URL, JHO_CV_PATH, JHO_KB_PATH } from './constants.js';
import { InitCancelled } from './errors.js';
import type { InitOptions } from './types.js';

/** Existing campaign values used to pre-fill init prompts on re-init. */
interface ExistingCampaignValues {
  cvPath?: string;
  linkedinUrl?: string;
}

/**
 * Load existing campaign config for pre-filling prompts.
 * Returns empty values when the campaign directory doesn't exist yet.
 */
export async function loadExistingCampaignValues(
  name: string,
  log: Logger,
): Promise<ExistingCampaignValues> {
  try {
    const campaignConfig = loadCampaignConfig(name);
    return {
      cvPath: campaignConfig.cv?.path || undefined,
      linkedinUrl: campaignConfig.linkedin?.url || undefined,
    };
  } catch (err) {
    log.debug({ err }, 'campaign.config.load.failed');
    return {};
  }
}

/**
 * Step 1: LinkedIn profile URL. Pre-fills from --linkedin, JHO_LINKEDIN_URL,
 * then the existing campaign config.
 * @throws {InitCancelled} if the user cancels.
 */
export async function promptLinkedin(
  opts: InitOptions,
  existingLinkedinUrl: string | undefined,
): Promise<string | undefined> {
  const envLinkedinUrl = process.env[JHO_LINKEDIN_URL];
  let linkedinUrl = (opts.linkedin ?? envLinkedinUrl)?.trim() || undefined;

  if (!linkedinUrl && !opts.yes) {
    const input = await text({
      message: 'LinkedIn profile URL? (optional, press Enter to skip)',
      initialValue: existingLinkedinUrl || undefined,
      placeholder: '',
    });

    if (isCancel(input)) {
      throw new InitCancelled();
    }

    linkedinUrl = input?.trim() || undefined;
  } else if (!linkedinUrl && existingLinkedinUrl) {
    linkedinUrl = existingLinkedinUrl;
  }

  return linkedinUrl;
}

/**
 * Step 2: CV path. Pre-fills from --cv and JHO_CV_PATH.
 * @throws {InitCancelled} if the user cancels.
 */
export async function promptCvPath(
  opts: InitOptions,
  existingCvPath: string | undefined,
): Promise<string | undefined> {
  const envCvPath = process.env[JHO_CV_PATH];
  let cvPath = (opts.cv ?? envCvPath)?.trim() || undefined;

  if (!cvPath && !opts.yes) {
    const input = await text({
      message: 'Path to your CV file (PDF, DOCX, MD, TXT)? (optional, press Enter to skip)',
      initialValue: existingCvPath || undefined,
      placeholder: '',
    });

    if (isCancel(input)) {
      throw new InitCancelled();
    }

    cvPath = input?.trim() || undefined;
  } else if (!cvPath && existingCvPath) {
    cvPath = existingCvPath;
  }

  return cvPath;
}

/**
 * Step 3: knowledge-base source path (optional). Pre-fills from --kb and
 * JHO_KB_PATH.
 * @throws {InitCancelled} if the user cancels.
 */
export async function promptKbPath(opts: InitOptions): Promise<string | undefined> {
  const envKbPath = process.env[JHO_KB_PATH];
  let kbPath = (opts.kb ?? envKbPath)?.trim() || undefined;

  if (!kbPath && !opts.yes) {
    const input = await text({
      message:
        'Path to a knowledge-base file or folder (PDF, DOCX, MD, TXT)? (optional, press Enter to skip)',
      placeholder: '',
    });

    if (isCancel(input)) {
      throw new InitCancelled();
    }

    kbPath = input?.trim() || undefined;
  }

  return kbPath;
}

/**
 * Validate the CV path with a retry loop. In --yes mode an invalid CV is
 * silently skipped; interactively the user is re-prompted until valid or
 * skipped (Enter / cancel).
 */
export async function validateCvWithRetry(
  cvPath: string | undefined,
  nonInteractive: boolean,
): Promise<string | undefined> {
  let resolved = cvPath;

  while (resolved) {
    const result = await validateCvPath(resolved);

    if (result.ok) {
      break;
    }

    if (nonInteractive) {
      clackLog.warn(`CV path invalid in non-interactive mode, skipping: ${result.error}`);
      resolved = undefined;
      break;
    }

    clackLog.warn(result.error ?? 'Invalid CV path');
    const retry = await text({
      message: 'Enter a different CV path, or press Enter to skip:',
      defaultValue: '',
    });

    if (isCancel(retry) || retry === '') {
      resolved = undefined;
    } else {
      resolved = retry.trim();
    }
  }

  return resolved;
}
