/**
 * Core orchestrator for the `jho list` workflow. Follows the same
 * pattern as `core/track/track.ts`: all business logic lives here,
 * the CLI is a thin wrapper that handles presentation.
 *
 * This module is reusable from both the CLI and the MCP server.
 */
import {
  resolveDataRoot,
  resolveCampaignRoot,
  resolveAppliedDir,
  listCampaigns,
} from '../paths.js';
import { listApplications } from '../applications/applications.js';
import { APPLICATION_STATUSES } from '../applications/types.js';
import type { ApplicationStatus, EmploymentType } from '../applications/types.js';
import type { CampaignListing } from '../types.js';
import type { ApplicationEntry } from '../applications/types.js';
import { InvalidListStatusError } from './errors.js';

/**
 * Options for {@link runListApplications}.
 */
export interface ListApplicationsOptions {
  /** Filter by status. */
  status?: string;
  /** AND-combined tags filter. */
  tags?: string[];
  /** Filter by target role slug. */
  targetRole?: string;
  /** Filter by employment type. */
  employmentType?: EmploymentType;
}

/**
 * Result of {@link runListCampaigns}: the list of campaigns.
 */
export interface ListCampaignsResult {
  campaigns: CampaignListing[];
}

/**
 * Result of {@link runListApplications}: the filtered application entries.
 */
export interface ListApplicationsResult {
  entries: ApplicationEntry[];
}

/**
 * Validate a raw status value and return a typed application status.
 * @throws {InvalidListStatusError} when the status value is not a valid application status.
 */
function validateStatus(status: string | undefined): ApplicationStatus | undefined {
  if (status === undefined) {
    return undefined;
  }
  if (!APPLICATION_STATUSES.includes(status as ApplicationStatus)) {
    throw new InvalidListStatusError(status);
  }
  return status as ApplicationStatus;
}

/**
 * List all campaigns under the data root.
 * Delegates to the lower-level {@link listCampaigns} for the actual
 * filesystem scan.
 */
export async function runListCampaigns(): Promise<ListCampaignsResult> {
  const dataRoot = resolveDataRoot();
  const campaigns = await listCampaigns(dataRoot);
  return { campaigns };
}

/**
 * List applications in a campaign, with optional AND-combined filters.
 * Validates the status filter before delegating to {@link listApplications}.
 *
 * @param campaign - Campaign name.
 * @param opts - Filter options.
 * @throws {InvalidListStatusError} when the status value is invalid.
 * @throws {ListError} on campaign resolution failure.
 */
export async function runListApplications(
  campaign: string,
  opts: ListApplicationsOptions,
): Promise<ListApplicationsResult> {
  const status = validateStatus(opts.status);

  const campaignRoot = resolveCampaignRoot(campaign);
  const appliedDir = resolveAppliedDir(campaignRoot);

  const entries = await listApplications(appliedDir, {
    status,
    tags: opts.tags && opts.tags.length > 0 ? opts.tags : undefined,
    targetRole: opts.targetRole,
    employmentType: opts.employmentType,
  });

  return { entries };
}
