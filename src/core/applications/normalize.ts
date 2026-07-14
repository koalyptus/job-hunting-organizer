/**
 * Parse freeform employment type string to constrained enum.
 * Maps common LLM output variants to standard values.
 * Returns empty string for unrecognized values (unspecified).
 */
import type { EmploymentType } from './types.js';

const PERMANENT_VARIANTS = [
  'permanent',
  'full-time',
  'fulltime',
  'ft',
  'regular',
  'ongoing',
  'employee',
  'full time',
];

const PART_TIME_VARIANTS = ['part-time', 'parttime', 'pt', 'half-time', 'part time'];

const CONTRACT_VARIANTS = [
  'contract',
  'contractor',
  'freelance',
  'freelancer',
  'consulting',
  'consultant',
  'fixed-term',
  'fixed term',
  'fixedterm',
];

const TEMP_VARIANTS = [
  'temp',
  'temporary',
  'temporary contract',
  'seasonal',
  'internship',
  'intern',
];

const CASUAL_VARIANTS = ['casual', 'on-call', 'on call', 'zero hours', 'zerohours', 'zero-hours'];

/**
 * Parse a freeform employment type string to the constrained enum.
 * @param value - The raw string from LLM extraction.
 * @returns The parsed EmploymentType, or empty string if unrecognized/unspecified.
 */
export function parseEmploymentType(value: string | undefined): EmploymentType {
  if (!value) {
    return '';
  }
  const v = value.toLowerCase().trim();

  if (PERMANENT_VARIANTS.includes(v)) {
    return 'permanent';
  }
  if (PART_TIME_VARIANTS.includes(v)) {
    return 'part-time';
  }
  if (CONTRACT_VARIANTS.includes(v)) {
    return 'contract';
  }
  if (TEMP_VARIANTS.includes(v)) {
    return 'temp';
  }
  if (CASUAL_VARIANTS.includes(v)) {
    return 'casual';
  }

  // Rejection apps: fallback on any user-provided application type
  if (v === 'rejection') {
    return 'temp';
  }

  // Unknown - return empty to let it be unspecified
  return '';
}
