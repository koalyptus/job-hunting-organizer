/**
 * Core orchestrator for the `jho track` workflow. Follows the same
 * pattern as `core/init/wizard.ts`: all business logic lives here,
 * the CLI is a thin wrapper that parses options and catches errors.
 *
 * This module is reusable from both the CLI and the MCP server.
 */
import type { Logger } from 'pino';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolveCampaignRoot, resolveAppliedDir } from '../paths.js';
import { isUrl } from '../url.js';
import { getConfig } from '../config.js';
import { defaultLlmConfig } from '../llm.js';
import { moduleLogger } from '../logger/logger.js';
import { readProfile } from '../profile.js';
import { parseTargetRoles } from '../target-roles.js';
import { extractJdFromUrl, extractJdFromText } from '../jobs/extract.js';
import { suggestTargetRole } from '../jobs/suggest.js';
import {
  createApplication,
  updateApplication,
  readApplication,
  appendNote,
} from '../applications/applications.js';
import { TrackError, TrackCancelled, NoLinkStoredError, InvalidStatusError } from './errors.js';
import { confirmTrackSummary, confirmTrackUpdate } from './prompts.js';
import type { ExtractedJd, RoleSuggestion } from '../jobs/types.js';
import { APPLICATION_STATUSES } from '../applications/types.js';
import type { ApplicationStatus } from '../applications/types.js';
import type { TargetRole } from '../types.js';
import { replaceRegion, replaceSteer } from '../markers.js';
import { atomicWrite } from '../fs.js';
import { acquireLock } from '../locks.js';

const log = moduleLogger(import.meta.url);

/**
 * Unified options for {@link runTrack}. The function determines
 * whether to create or update based on the provided fields.
 *
 * - **Create mode**: `url` or `text` is provided.
 * - **Update mode**: `slug` is provided (resolved by CLI via `resolveSlug`).
 */
interface TrackOptions {
  /** Campaign name. */
  campaign: string;
  /** Job posting URL (create mode). */
  url?: string;
  /** Raw JD text from clipboard/stdin (create mode). */
  text?: string;
  /** Application slug, already resolved by CLI (update mode). */
  slug?: string;
  /** New status. */
  status?: ApplicationStatus;
  /** Salary or pay range. */
  salary?: string;
  /** Tags to add. */
  tags?: string[];
  /** Target role slug override. */
  targetRole?: string;
  /** Note to append to jd.md. */
  note?: string;
  /**
   * Custom LLM instructions for JD extraction. When provided, overwrites
   * any existing steer in `jd.md`.
   */
  steer?: string;
  /** Skip confirmation prompts. */
  yes?: boolean;
  /** Re-fetch JD from stored URL (update mode). */
  refresh?: boolean;
  /** Optional pino logger. */
  log?: Logger;
}

/**
 * Validate a raw status value from the CLI and return a typed application status.
 * Returns `undefined` when no status was provided.
 * @throws {TrackError} when the status value is invalid.
 */
export function validateTrackStatus(status: string | undefined): ApplicationStatus | undefined {
  if (status === undefined) {
    return undefined;
  }

  if (!APPLICATION_STATUSES.includes(status as ApplicationStatus)) {
    throw new InvalidStatusError(status);
  }

  return status as ApplicationStatus;
}

/**
 * Determine whether the raw CLI track flags include any update patch fields.
 */
export function hasTrackUpdateFlags(opts: {
  status?: unknown;
  salary?: unknown;
  tag?: string[] | undefined;
  note?: unknown;
  targetRole?: unknown;
  steer?: unknown;
}): boolean {
  return (
    opts.status !== undefined ||
    opts.salary !== undefined ||
    (opts.tag !== undefined && opts.tag.length > 0) ||
    opts.note !== undefined ||
    opts.targetRole !== undefined ||
    opts.steer !== undefined
  );
}

/**
 * Write a steer marker to the application's jd.md file. This is a
 * shared helper used by the three code paths that write steer:
 * confirmAndCreate, runTrackCreate, and runTrackUpdate.
 */
async function writeSteerToJd(appliedDir: string, slug: string, steer: string): Promise<void> {
  const appFolder = join(appliedDir, slug);
  const jdPath = join(appFolder, 'jd.md');

  await acquireLock(appFolder, async () => {
    let jdContent = '';
    try {
      jdContent = await readFile(jdPath, 'utf8');
    } catch (err) {
      log.debug({ slug, err }, 'jd.md not found when writing steer; creating fresh file');
    }
    const updatedJd = replaceSteer(jdContent, steer);
    await atomicWrite(jdPath, updatedJd);
  });
}

/**
 * Result of {@link prepareTrack}: extracted JD, role suggestion, and target roles.
 * Used by the CLI to display a summary before confirmation.
 */
export interface TrackSummary {
  /** Extracted job description. */
  jd: ExtractedJd;
  /** Role suggestion from LLM. */
  suggestion: RoleSuggestion;
  /** All target roles from the profile. */
  targetRoles: TargetRole[];
}

/**
 * Options for {@link confirmAndCreate}. Extends the summary data with
 * creation-specific fields.
 */
export interface ConfirmAndCreateOptions {
  /** Campaign name. */
  campaign: string;
  /** Extracted JD summary. */
  summary: TrackSummary;
  /** Job posting URL. */
  url?: string;
  /** New status. */
  status?: ApplicationStatus;
  /** Salary or pay range. */
  salary?: string;
  /** Tags to add. */
  tags?: string[];
  /** Target role slug override. */
  targetRole?: string;
  /** Note to append to jd.md. */
  note?: string;
  /**
   * Custom LLM instructions for JD extraction. When provided, overwrites
   * any existing steer in `jd.md`.
   */
  steer?: string;
  /** Skip confirmation prompt. */
  yes?: boolean;
}

/**
 * Build a human-readable list of changes for the update confirmation prompt.
 * Only includes fields that actually differ from the current state.
 */
function describeChanges(
  opts: {
    status?: string;
    salary?: string;
    tags?: string[];
    targetRole?: string;
  },
  current: { status?: string },
): string[] {
  const changes: string[] = [];
  if (opts.status !== undefined && opts.status !== current.status) {
    changes.push(`status → ${opts.status}`);
  }
  if (opts.salary !== undefined) {
    changes.push(`salary → ${opts.salary}`);
  }
  if (opts.targetRole !== undefined) {
    changes.push(`target role → ${opts.targetRole}`);
  }
  if (opts.tags !== undefined && opts.tags.length > 0) {
    changes.push(`tags +${opts.tags.join(', ')}`);
  }
  return changes;
}

/**
 * Result of {@link runTrack}: the slug and whether any changes were
 * applied. For create mode, `changed` is always `true`. For update mode,
 * `changed` is `false` when no patch fields were provided (no prompt
 * is shown and no files are written).
 */
export interface TrackResult {
  /** Application slug. */
  slug: string;
  /** Whether any changes were applied. */
  changed: boolean;
}

/**
 * Run the full track workflow: determine mode → extract/update → confirm →
 * create or update application. Returns the slug.
 *
 * - **Create mode**: URL or text provided → extract JD → suggest role → confirm → create.
 * - **Update mode**: slug provided → read → diff → confirm → update.
 * - **Refresh mode**: slug provided with --refresh → re-fetch JD from stored URL → update jd.md.
 *
 * @throws {TrackCancelled} when the user cancels the confirmation.
 * @throws {TrackError} on extraction, suggestion, creation, or update failure.
 */
export async function runTrack(opts: TrackOptions): Promise<TrackResult> {
  const { url, text, slug, refresh } = opts;

  // Refresh mode: re-fetch JD for existing application
  if (refresh) {
    if (!slug) {
      throw new TrackError('missing slug');
    }
    return runTrackRefresh(opts);
  }

  const isCreate = text !== undefined || isUrl(url);

  if (isCreate) {
    const createdSlug = await runTrackCreate(opts);
    return { slug: createdSlug, changed: true };
  }

  if (!slug) {
    throw new TrackError('missing slug');
  }

  return runTrackUpdate(opts);
}

/**
 * Prepare a track summary by extracting the JD and suggesting a target role.
 * Used by the CLI to show a summary before confirmation, with a spinner
 * only during the extraction step.
 *
 * @returns The extracted JD, role suggestion, and target roles.
 * @throws {TrackError} on extraction or suggestion failure.
 */
export async function prepareTrack(opts: TrackOptions): Promise<TrackSummary> {
  const { campaign, url, text, log } = opts;

  if (!url && !text) {
    throw new TrackError('No URL or text provided');
  }

  const campaignRoot = resolveCampaignRoot(campaign);

  // Load LLM config
  const { global } = getConfig(campaign);
  const llmConfig = defaultLlmConfig(global);

  // Load target roles for role suggestion
  let targetRoles: TargetRole[] = [];
  try {
    const profile = await readProfile(campaignRoot);
    targetRoles = parseTargetRoles(profile);
  } catch (err) {
    log?.debug({ err }, 'profile.read.failed');
    // No profile — proceed without role suggestion
  }

  // Extract JD
  let jd: ExtractedJd;
  try {
    if (url) {
      jd = await extractJdFromUrl(url, llmConfig, log, global.fetch?.timeoutMs);
    } else {
      jd = await extractJdFromText(text!, llmConfig, log);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new TrackError(`Failed to extract JD: ${msg}`);
  }

  // Suggest target role
  let suggestion: RoleSuggestion;
  if (targetRoles.length > 0) {
    try {
      suggestion = await suggestTargetRole(jd, targetRoles, llmConfig, log);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new TrackError(`Failed to suggest target role: ${msg}`);
    }
  } else {
    suggestion = { roleSlug: '', confidence: 0, reasoning: 'No target roles defined.' };
  }

  return { jd, suggestion, targetRoles };
}

/**
 * Confirm and create an application from a prepared track summary.
 * Used by the CLI after the extraction spinner completes.
 *
 * @throws {TrackCancelled} when the user cancels the confirmation.
 * @throws {TrackError} on creation failure.
 */
export async function confirmAndCreate(opts: ConfirmAndCreateOptions): Promise<string> {
  const {
    campaign,
    summary: { jd, suggestion, targetRoles },
    url,
    status,
    salary,
    tags,
    targetRole,
    note,
    steer,
    yes,
  } = opts;

  const campaignRoot = resolveCampaignRoot(campaign);
  const appliedDir = resolveAppliedDir(campaignRoot);

  // Confirm (unless --yes)
  if (!yes) {
    const confirmed = await confirmTrackSummary(jd, suggestion, targetRoles, campaign);
    if (!confirmed) {
      throw new TrackCancelled();
    }
  }

  // Create application
  const slug = await createApplication({
    appliedDir,
    title: jd.title,
    company: jd.company,
    url,
    status,
    salary,
    tags,
    targetRole: suggestion.roleSlug || targetRole,
    location: jd.location,
    link: url,
    description: jd.description,
  });

  // Append note if provided
  if (note) {
    await appendNote(appliedDir, slug, note);
  }

  // Write steer to jd.md if provided
  if (steer) {
    await writeSteerToJd(appliedDir, slug, steer);
  }

  return slug;
}

/**
 * Run the track-create workflow: extract JD → suggest role → confirm → create.
 */
async function runTrackCreate(opts: TrackOptions): Promise<string> {
  const { campaign, url, text, status, salary, tags, targetRole, note, steer, yes, log } = opts;

  if (!url && !text) {
    throw new TrackError('No URL or text provided');
  }

  const campaignRoot = resolveCampaignRoot(campaign);
  const appliedDir = resolveAppliedDir(campaignRoot);

  // Load LLM config
  const { global } = getConfig(campaign);
  const llmConfig = defaultLlmConfig(global);

  // Load target roles for role suggestion
  let targetRoles: TargetRole[] = [];
  try {
    const profile = await readProfile(campaignRoot);
    targetRoles = parseTargetRoles(profile);
  } catch (err) {
    log?.debug({ err }, 'profile.read.failed');
    // No profile — proceed without role suggestion
  }

  // Step 1: Extract JD
  let jd: ExtractedJd;
  try {
    if (url) {
      jd = await extractJdFromUrl(url, llmConfig, log, global.fetch?.timeoutMs);
    } else {
      jd = await extractJdFromText(text!, llmConfig, log);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new TrackError(`Failed to extract JD: ${msg}`);
  }

  // Step 2: Suggest target role
  let suggestion: RoleSuggestion;
  if (targetRoles.length > 0) {
    try {
      suggestion = await suggestTargetRole(jd, targetRoles, llmConfig, log);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new TrackError(`Failed to suggest target role: ${msg}`);
    }
  } else {
    suggestion = { roleSlug: '', confidence: 0, reasoning: 'No target roles defined.' };
  }

  // Step 3: Confirm (unless --yes)
  if (!yes) {
    const confirmed = await confirmTrackSummary(jd, suggestion, targetRoles, campaign);
    if (!confirmed) {
      throw new TrackCancelled();
    }
  }

  // Step 4: Create application
  const slug = await createApplication({
    appliedDir,
    title: jd.title,
    company: jd.company,
    url,
    status,
    salary,
    tags,
    targetRole: suggestion.roleSlug || targetRole,
    location: jd.location,
    link: url,
    description: jd.description,
  });

  // Append note if provided
  if (note) {
    await appendNote(appliedDir, slug, note);
  }

  // Write steer to jd.md if provided
  if (steer) {
    await writeSteerToJd(appliedDir, slug, steer);
  }

  return slug;
}

/**
 * Run the track-update workflow: read → diff → confirm → update.
 *
 * If no patch fields are provided (no --status, --salary, --tag, --note,
 * or --target-role), no prompt is shown and no files are written — the
 * function returns `{ slug, changed: false }` so the CLI can report
 * "no changes to apply".
 */
async function runTrackUpdate(opts: TrackOptions): Promise<TrackResult> {
  const { campaign, slug, status, salary, tags, targetRole, note, steer, yes } = opts;

  if (!slug) {
    throw new TrackError('missing slug');
  }

  const campaignRoot = resolveCampaignRoot(campaign);
  const appliedDir = resolveAppliedDir(campaignRoot);

  // Read current state
  const app = await readApplication(appliedDir, slug);
  const { frontmatter } = app;

  // Build patch from flags
  const patch: {
    status?: ApplicationStatus;
    salary?: string;
    tags?: string[];
    targetRole?: string;
  } = {};

  if (status !== undefined) {
    patch.status = status;
  }
  if (salary !== undefined) {
    patch.salary = salary;
  }
  if (tags !== undefined && tags.length > 0) {
    patch.tags = tags;
  }
  if (targetRole !== undefined) {
    patch.targetRole = targetRole;
  }

  const hasChanges = [
    patch.status !== undefined,
    patch.salary !== undefined,
    patch.tags !== undefined,
    patch.targetRole !== undefined,
    note !== undefined,
    steer !== undefined,
  ].some(Boolean);

  if (!hasChanges) {
    return { slug, changed: false };
  }

  // Confirm (unless --yes)
  if (!yes) {
    const changes = describeChanges(
      {
        status: patch.status,
        salary: patch.salary,
        tags: patch.tags,
        targetRole: patch.targetRole,
      },
      { status: frontmatter.status },
    );
    if (note) {
      changes.push(`note +${note}`);
    }
    if (steer !== undefined) {
      changes.push(`steer → ${steer}`);
    }
    const confirmed = await confirmTrackUpdate(slug, frontmatter.status, changes);
    if (!confirmed) {
      throw new TrackCancelled();
    }
  }

  // Update
  await updateApplication(appliedDir, slug, patch);

  // Append note if provided
  if (note) {
    await appendNote(appliedDir, slug, note);
  }

  // Write steer to jd.md if provided
  if (steer) {
    await writeSteerToJd(appliedDir, slug, steer);
  }

  return { slug, changed: true };
}

/**
 * Run the track-refresh workflow: read existing app → re-fetch JD →
 * update jd.md fetched-jd region → confirm → write back.
 *
 * The user notes below the `<!-- jho:end:fetched-jd -->` marker are preserved.
 *
 * @throws {TrackCancelled} when the user cancels the confirmation.
 * @throws {TrackError} on fetch, extraction, or write failure.
 */
export async function runTrackRefresh(opts: TrackOptions): Promise<TrackResult> {
  const { campaign, slug, text, yes, log } = opts;

  if (!slug) {
    throw new TrackError('missing slug');
  }

  const campaignRoot = resolveCampaignRoot(campaign);
  const appliedDir = resolveAppliedDir(campaignRoot);

  // Read current application state
  const app = await readApplication(appliedDir, slug);
  const { frontmatter } = app;

  // Get the link from the stored application
  const link = frontmatter.link;
  if (!link) {
    throw new NoLinkStoredError(slug);
  }

  // Load LLM config
  const { global } = getConfig(campaign);
  const llmConfig = defaultLlmConfig(global);

  // Extract JD from URL or provided text
  let jd: ExtractedJd;
  try {
    if (text) {
      jd = await extractJdFromText(text, llmConfig, log);
    } else {
      jd = await extractJdFromUrl(link, llmConfig, log, global.fetch?.timeoutMs);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new TrackError(`Failed to refresh JD: ${msg}`);
  }

  // Confirm unless --yes
  if (!yes) {
    const confirmed = await confirmTrackUpdate(slug, frontmatter.status, [
      `re-fetch JD from ${text ? 'pasted text' : link}`,
    ]);
    if (!confirmed) {
      throw new TrackCancelled();
    }
  }

  // Read current jd.md content
  const folder = join(campaignRoot, 'applied', slug);
  const jdPath = join(folder, 'jd.md');
  let jdContent = '';
  if (existsSync(jdPath)) {
    jdContent = await readFile(jdPath, 'utf8');
  }

  // Replace the fetched-jd region with the new description
  const updatedJdContent = replaceRegion(jdContent, 'fetched-jd', jd.description ?? '', {
    createIfMissing: true,
  });

  // Write back jd.md
  const written = await atomicWrite(jdPath, updatedJdContent);
  if (!written) {
    throw new TrackError(`failed to write jd.md for ${slug}`);
  }

  log?.info({ slug, link }, 'track.refresh.completed');

  return { slug, changed: true };
}
