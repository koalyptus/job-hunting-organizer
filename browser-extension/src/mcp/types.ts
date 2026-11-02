/**
 * Shared shapes for the extension's view of the jho MCP tool surface.
 *
 * These mirror the server-side types in `src/workflow/applications/types.ts`
 * (`APPLICATION_STATUSES`, `EMPLOYMENT_TYPES`, `ApplicationEntry`). They are
 * duplicated deliberately: the #113 location decision made the MCP tool set the
 * contract, so the extension never imports `src/core/` or `src/workflow/`.
 *
 * The values below are transcribed from that file, not invented. Note that `''`
 * in `EMPLOYMENT_TYPES` means "unspecified" and the server emits it.
 */

/** Application status values, as returned by `list_applications`. */
export const APPLICATION_STATUSES = [
  'applied',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
  'abandoned',
  'ghosted',
  'accepted',
] as const;

/** Union of {@link APPLICATION_STATUSES}. */
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Employment types, as returned by `list_applications`. `''` = unspecified. */
export const EMPLOYMENT_TYPES = [
  'permanent',
  'temp',
  'contract',
  'casual',
  'part-time',
  '',
] as const;

/** Union of {@link EMPLOYMENT_TYPES}. */
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/** One application row, as shaped by the `list_applications` tool. */
export interface ApplicationEntry {
  /** Application slug (folder name under `applied/`). */
  slug: string;
  /** Current application status. */
  status: ApplicationStatus;
  /** Job title. */
  title: string;
  /** Company name. */
  company: string;
  /** Job board or source site. */
  site: string;
  /** Freeform location text. */
  location: string;
  /** Slug of the target role (empty string if unassigned). */
  targetRole: string;
  /** Application date as an ISO date string. */
  appliedOn: string;
  /** Classification tags. */
  tags: string[];
  /** Employment type (empty string if unspecified). */
  employmentType: EmploymentType;
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
