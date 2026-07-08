// CLI-specific option validation functions.
// These follow the same pattern as core/validate.ts but are specific to CLI flags.

import { FILTERABLE_LOG_LEVELS, type LogLevel } from '../core/types.js';
import { daysInMonth } from '../core/date.js';

const TAIL_ERROR = '--tail must be a positive integer';
const DATETIME_ERROR = 'must be "YYYY-MM-DD HH:MM" or "YYYY-MM-DD HH:MM:SS"';

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

/**
 * Validate a datetime string for interview scheduling.
 * Accepts "YYYY-MM-DD HH:MM" or "YYYY-MM-DD HH:MM:SS".
 * Also validates that the date components are realistic (month 1-12, day 1-31, etc.).
 * Returns null if valid, or an error message string if invalid.
 */
export function validateDatetime(value: string): string | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return DATETIME_ERROR;
  }

  const year = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10);
  const day = parseInt(match[3]!, 10);
  const hour = parseInt(match[4]!, 10);
  const minute = parseInt(match[5]!, 10);
  const second = match[6] ? parseInt(match[6], 10) : 0;

  if (month < 1 || month > 12) {
    return 'month must be 01-12';
  }
  if (day < 1 || day > 31) {
    return 'day must be 01-31';
  }
  if (hour > 23) {
    return 'hour must be 00-23';
  }
  if (minute > 59) {
    return 'minute must be 00-59';
  }
  if (second > 59) {
    return 'second must be 00-59';
  }

  if (day > daysInMonth(year, month)) {
    return `month ${month} has at most ${daysInMonth(year, month)} days`;
  }

  return null;
}
