/** Severity of a diagnostic issue. */
export const DOCTOR_SEVERITIES = ['error', 'warn', 'info'] as const;

/** @see {@link DOCTOR_SEVERITIES} */
export type DoctorSeverity = (typeof DOCTOR_SEVERITIES)[number];

/** Category of a diagnostic issue, grouping related checks. */
export const DOCTOR_CATEGORIES = ['applied', 'frontmatter', 'toolhash', 'index', 'config'] as const;

/** @see {@link DOCTOR_CATEGORIES} */
export type DoctorCategory = (typeof DOCTOR_CATEGORIES)[number];

/**
 * A single diagnostic issue returned by {@link diagnoseCampaign} or
 * {@link diagnoseApp}. Each issue describes one check that failed.
 */
export interface DoctorIssue {
  /** How severe the issue is. */
  readonly severity: DoctorSeverity;
  /** Category grouping related issues. */
  readonly category: DoctorCategory;
  /** Machine-readable check name (e.g. `'missing_config'`). */
  readonly check: string;
  /** Human-readable description of the problem. */
  readonly message: string;
  /** Slug of the affected application, or `null` for campaign-level issues. */
  readonly slug: string | null;
  /** How to fix the issue (e.g. `'run jho init'`). */
  readonly remediation: string;
}
