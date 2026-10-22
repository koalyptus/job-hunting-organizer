/**
 * Shared shapes for the extension's view of the jho MCP tool surface.
 *
 * These mirror the server-side unions in
 * `src/workflow/applications/types.ts` (`APPLICATION_STATUSES`,
 * `EMPLOYMENT_TYPES`). They are duplicated deliberately: the #113 location
 * decision made the MCP tool set the contract, so the extension never imports
 * `src/core/` or `src/workflow/`.
 */

/** Application status values, as returned by `list_applications`. */
export const APPLICATION_STATUSES = [
  'wishlist',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'abandoned',
] as const;

/** Union of {@link APPLICATION_STATUSES}. */
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Employment types, as returned by `list_applications`. */
export const EMPLOYMENT_TYPES = [
  'permanent',
  'temp',
  'contract',
  'casual',
  'part-time',
] as const;

/** Union of {@link EMPLOYMENT_TYPES}. */
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/** One application row, as shaped by the `list_applications` tool. */
export interface ApplicationEntry {
  /** Application slug (folder name under `applied/`). */
  slug: string;
  /** Current application status. */
  status: ApplicationStatus;
  /** Normalised job title. */
  title: string;
  /** Normalised company name. */
  company: string;
  /** Source URL the application was tracked from. */
  url: string;
  /** Suggested target role slug, if any. */
  targetRole?: string;
  /** Employment type, if set. */
  employmentType?: EmploymentType;
  /** Free-form tags. */
  tags?: string[];
}

/** Campaign summary returned by `list_campaigns`. */
export interface CampaignSummary {
  /** Campaign name (folder name under `campaigns/`). */
  name: string;
  /** Number of applications in the campaign. */
  applicationCount: number;
}

/** Result envelope for a single tool call. */
export interface ToolResult {
  /** Whether the tool reported `isError`. */
  isError: boolean;
  /** Decoded text content blocks. */
  text: string[];
}
