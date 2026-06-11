import { pathExists } from '../fs.js';
import { CV_EXTENSIONS } from './constants.js';

/** Result of CV path validation. */
export interface CvValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Validate a CV path. Checks existence and extension.
 * Returns `{ ok: true }` on success, or `{ ok: false, error }` with a message.
 */
export async function validateCvPath(cvPath: string): Promise<CvValidationResult> {
  if (!(await pathExists(cvPath))) {
    return { ok: false, error: `CV file not found: ${cvPath}` };
  }

  const ext = cvPath.substring(cvPath.lastIndexOf('.')).toLowerCase();

  if (!CV_EXTENSIONS.includes(ext)) {
    return {
      ok: false,
      error: `Unsupported CV format "${ext}". Supported: ${CV_EXTENSIONS.join(', ')}`,
    };
  }

  return { ok: true };
}
