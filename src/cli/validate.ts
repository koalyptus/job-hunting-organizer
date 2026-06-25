// CLI-specific option validation functions.
// These follow the same pattern as core/validate.ts but are specific to CLI flags.

import { FILTERABLE_LOG_LEVELS, type LogLevel } from '../core/types.js';

const TAIL_ERROR = '--tail must be a positive integer';

/**
 * Validate the --tail option value.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateTailOption(value: string): string | null {
  // Must be a string that represents a positive integer with no extra characters
  if (!/^\d+$/.test(value)) {
    return TAIL_ERROR;
  }
  const n = parseInt(value, 10);
  if (n < 1) {
    return TAIL_ERROR;
  }
  return null;
}

/**
 * Validate the --level option value.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateLevelOption(value: string): string | null {
  if (!FILTERABLE_LOG_LEVELS.includes(value.toLowerCase() as LogLevel)) {
    return `--level must be one of: ${FILTERABLE_LOG_LEVELS.join(', ')}`;
  }
  return null;
}
