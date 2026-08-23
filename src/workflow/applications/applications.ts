import { mkdir, rm, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { uniqueSlug, SLUG_PATTERN } from '../../core/parser/slug.js';
import { mergeFrontmatter } from '../../core/parser/frontmatter.js';
import { writeFrontmatter, readFrontmatter } from '../../lib/frontmatter.js';
import { atomicWrite } from '../../lib/fs.js';
import { acquireLock } from '../../lib/locks.js';
import { getRootLogger, moduleLogger } from '../../lib/logger/logger.js';
import { computeHash, writeToolhash } from '../../lib/toolhash.js';
import { ApplicationFrontmatterSchema } from './meta-schema.js';
import {
  upsertIndexEntry,
  removeIndexEntry,
  readIndex,
  writeIndex,
  rebuildIndex,
} from './index-builder.js';
import { removeCounterEntry } from './counters.js';
import { replaceRegion } from '../../core/parser/markers.js';
import { toDateKey, todayDateKey } from '../../core/date.js';
import type {
  ApplicationEntry,
  ApplicationStatus,
  CreateApplicationInput,
  UpdateApplicationInput,
  UpdateApplicationOptions,
  ApplicationFrontmatter,
  EmploymentType,
} from './types.js';
import type { Frontmatter } from '../../core/types.js';

/**
 * Thrown when an application folder or its `meta.md` is not found.
 */
export class ApplicationNotFoundError extends Error {
  /**
   * @param slug - The application slug that was not found.
   */
  constructor(slug: string) {
    super(`application not found: ${slug}`);
    this.name = 'ApplicationNotFoundError';
  }
}

const appLog = moduleLogger(import.meta.url);

/**
 * The user-notes comment appended to new `jd.md` files.
 */
const USER_NOTES_COMMENT = '<!-- user notes below this line are preserved on re-track -->';

/**
 * Default initial status for new applications.
 */
const DEFAULT_STATUS: ApplicationStatus = 'applied';

/**
 * Build the updates object from an {@link UpdateApplicationInput} patch.
 * Only fields present in the patch are included.
 * @param patch - The patch fields.
 * @param existingTags - The current tags from the frontmatter.
 * @returns A partial updates object.
 */
function buildUpdates(
  patch: UpdateApplicationInput,
  existingTags: string[],
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    updates.status = patch.status;
  }
  if (patch.salary !== undefined) {
    updates.salary = patch.salary;
  }
  if (patch.targetRole !== undefined) {
    updates.targetRole = patch.targetRole;
  }
  if (patch.location !== undefined) {
    updates.location = patch.location;
  }
  if (patch.site !== undefined) {
    updates.site = patch.site;
  }
  if (patch.link !== undefined) {
    updates.link = patch.link;
  }
  if (patch.employmentType !== undefined) {
    updates.employmentType = patch.employmentType;
  }
  if (patch.tags !== undefined) {
    updates.tags = [...new Set([...existingTags, ...patch.tags])];
  }
  return updates;
}

/**
 * Build an `ApplicationEntry` from a `ApplicationFrontmatter` object.
 * @param fm - The validated frontmatter.
 * @returns An `ApplicationEntry` suitable for the index.
 */
function entryFromFrontmatter(fm: ApplicationFrontmatter): ApplicationEntry {
  return {
    slug: fm.slug,
    status: fm.status,
    title: fm.title,
    company: fm.company,
    site: fm.site,
    location: fm.location,
    targetRole: fm.targetRole,
    employmentType: fm.employmentType,
    appliedOn: fm.appliedOn,
    tags: fm.tags,
  };
}

/**
 * Create a new application: build slug, create folder, write `meta.md`
 * + `jd.md`, update `.index.json`. Returns the created slug.
 *
 * Lock granularity: acquires a lock on the `appliedDir` to prevent
 * concurrent slug collisions.
 *
 * @param input - Application details. `appliedDir` is required.
 * @returns The slug of the newly created application.
 * @throws If the folder already exists or a write fails.
 */
export async function createApplication(input: CreateApplicationInput): Promise<string> {
  const { appliedDir } = input;
  const log = appLog;
  log.info({ company: input.company, title: input.title }, 'application.create.start');
  await mkdir(appliedDir, { recursive: true });

  return acquireLock(appliedDir, async () => {
    const slug = await uniqueSlug(
      {
        title: input.title,
        company: input.company,
        url: input.url,
        appliedOn: input.appliedOn,
      },
      appliedDir,
      existsSync,
    );

    const folder = join(appliedDir, slug);
    await mkdir(folder, { recursive: true });

    const appliedOn = input.appliedOn !== undefined ? toDateKey(input.appliedOn) : todayDateKey();

    const fm: ApplicationFrontmatter = {
      slug,
      status: input.status ?? DEFAULT_STATUS,
      appliedOn,
      title: input.title ?? '',
      company: input.company ?? '',
      location: input.location ?? '',
      site: input.site ?? '',
      link: input.link ?? input.url ?? '',
      salary: input.salary ?? '',
      tags: input.tags ?? [],
      targetRole: input.targetRole ?? '',
      employmentType: input.employmentType ?? '',
    };

    const metaWritten = await writeFrontmatter(
      join(folder, 'meta.md'),
      fm as unknown as Frontmatter,
      '',
    );
    if (!metaWritten) {
      throw new Error(`failed to write meta.md for ${slug}`);
    }

    // Write toolhash sidecar for meta.md
    const metaContent = await readFile(join(folder, 'meta.md'), 'utf8');
    await writeToolhash(join(folder, 'meta.md'), computeHash(metaContent));

    const jdContent = replaceRegion('', 'fetched-jd', input.description ?? '', {
      createIfMissing: true,
    });
    const jdWritten = await atomicWrite(
      join(folder, 'jd.md'),
      jdContent + '\n' + USER_NOTES_COMMENT + '\n',
    );
    if (!jdWritten) {
      throw new Error(`failed to write jd.md for ${slug}`);
    }

    const entry = entryFromFrontmatter(fm);
    await upsertIndexEntry(appliedDir, entry);

    log.info({ slug, company: input.company, title: input.title }, 'application.created');
    return slug;
  });
}

/**
 * Update an existing application's `meta.md` frontmatter. Only the
 * fields present in `patch` are modified; all others are preserved.
 * The `.index.json` is updated to reflect the changes.
 *
 * @param appliedDir - The applied directory.
 * @param slug - The application slug to update.
 * @param patch - Fields to merge into the frontmatter.
 * @param options - Update options, including the optional `onlyIfStatus` guard.
 * @returns `true` when the patch was applied; `false` when skipped because the
 *   current status did not match `options.onlyIfStatus`.
 * @throws If the application folder or `meta.md` doesn't exist.
 */
export async function updateApplication(
  appliedDir: string,
  slug: string,
  patch: UpdateApplicationInput,
  options: UpdateApplicationOptions = {},
): Promise<boolean> {
  const log = appLog;
  const folder = join(appliedDir, slug);
  const metaPath = join(folder, 'meta.md');

  if (!existsSync(metaPath)) {
    throw new ApplicationNotFoundError(slug);
  }

  log.info({ slug, patch: Object.keys(patch) }, 'application.update.start');

  let updated = false;
  await acquireLock(folder, async () => {
    const { frontmatter, body } = await readFrontmatter(metaPath);

    if (options.onlyIfStatus !== undefined && frontmatter.status !== options.onlyIfStatus) {
      log.info(
        { slug, expected: options.onlyIfStatus, actual: frontmatter.status },
        'application.update.skipped',
      );
      return;
    }

    const existingTags = Array.isArray(frontmatter['tags'])
      ? (frontmatter['tags'] as string[])
      : [];
    const updates = buildUpdates(patch, existingTags);

    const merged = mergeFrontmatter(frontmatter, updates);
    const written = await writeFrontmatter(metaPath, merged, body);
    if (!written) {
      throw new Error(`failed to write meta.md for ${slug}`);
    }

    // Write toolhash sidecar for meta.md
    const updatedMeta = await readFile(metaPath, 'utf8');
    await writeToolhash(metaPath, computeHash(updatedMeta));

    const result = ApplicationFrontmatterSchema.safeParse(merged);
    if (result.success) {
      await upsertIndexEntry(appliedDir, entryFromFrontmatter(result.data));
    } else {
      getRootLogger().warn(
        { slug, issues: result.error.issues },
        'meta.md validation failed, index not updated',
      );
    }
    updated = true;
  });
  if (updated) {
    log.info({ slug }, 'application.update.completed');
  } else {
    log.info({ slug }, 'application.update.skipped_no_patch');
  }
  return updated;
}

/**
 * Read an application's validated frontmatter.
 * @param appliedDir - The applied directory.
 * @param slug - The application slug.
 * @returns The validated `ApplicationFrontmatter` and the raw body text.
 * @throws If the application doesn't exist or frontmatter is invalid.
 */
export async function readApplication(
  appliedDir: string,
  slug: string,
): Promise<{ frontmatter: ApplicationFrontmatter; body: string }> {
  const folder = join(appliedDir, slug);
  const metaPath = join(folder, 'meta.md');

  if (!existsSync(metaPath)) {
    throw new ApplicationNotFoundError(slug);
  }

  const { frontmatter, body } = await readFrontmatter(metaPath);
  const result = ApplicationFrontmatterSchema.parse(frontmatter);
  return { frontmatter: result, body };
}

/**
 * List all applications in the applied directory. Reads the `.index.json`
 * cache first; if missing, builds it from the folder listing.
 *
 * @param appliedDir - The applied directory.
 * @param filters - Optional AND-combined filters.
 * @returns A sorted array of `ApplicationEntry` (newest first).
 */
export async function listApplications(
  appliedDir: string,
  filters?: {
    status?: ApplicationStatus;
    targetRole?: string;
    tags?: string[];
    employmentType?: EmploymentType;
    filter?: string;
  },
): Promise<ApplicationEntry[]> {
  let entries = await readIndex(appliedDir);
  if (entries.length === 0 && existsSync(appliedDir)) {
    entries = await rebuildIndex(appliedDir);
  } else if (entries.length > 0 && existsSync(appliedDir)) {
    // Prune stale index entries whose folders no longer exist on disk.
    // This handles the case where applications were deleted outside the tool
    // (e.g. manual folder removal) and the index was never updated.
    const pruned = entries.filter((e) => existsSync(join(appliedDir, e.slug)));
    if (pruned.length !== entries.length) {
      await writeIndex(appliedDir, pruned);
      entries = pruned;
    }

    // Detect folders on disk that are missing from the index (e.g. created
    // outside the tool or after a rename). Rebuild when found so they appear
    // in listing results.
    const dirs = await readdir(appliedDir, { withFileTypes: true });
    const slugFolders = dirs.filter((d) => d.isDirectory() && SLUG_PATTERN.test(d.name));
    if (slugFolders.length !== entries.length) {
      entries = await rebuildIndex(appliedDir);
    }
  }

  if (filters) {
    if (filters.status) {
      entries = entries.filter((e) => e.status === filters.status);
    }
    if (filters.targetRole) {
      entries = entries.filter((e) => e.targetRole === filters.targetRole);
    }
    if (filters.employmentType) {
      entries = entries.filter((e) => e.employmentType === filters.employmentType);
    }
    if (filters.tags && filters.tags.length > 0) {
      entries = entries.filter((e) => filters.tags!.every((t) => e.tags.includes(t)));
    }
    if (filters.filter) {
      const term = filters.filter.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.title.toLowerCase().includes(term) ||
          e.company.toLowerCase().includes(term) ||
          e.location.toLowerCase().includes(term) ||
          e.slug.toLowerCase().includes(term) ||
          e.targetRole.toLowerCase().includes(term) ||
          e.site.toLowerCase().includes(term) ||
          e.tags.some((t) => t.toLowerCase().includes(term)),
      );
    }
  }

  return entries;
}

/**
 * Delete an application folder and remove it from the index and collision
 * counters. The folder (including `.toolhash` sidecars) is removed
 * recursively; the `.index.json` entry is removed; and the slug's
 * collision counter is cleaned from `.counters.json`.
 * @param appliedDir - The applied directory.
 * @param slug - The application slug to delete.
 * @returns `true` if the folder was deleted, `false` if it didn't exist.
 */
export async function deleteApplication(appliedDir: string, slug: string): Promise<boolean> {
  const folder = join(appliedDir, slug);
  if (!existsSync(folder)) {
    return false;
  }
  await rm(folder, { recursive: true, force: true });
  await removeIndexEntry(appliedDir, slug);
  await removeCounterEntry(appliedDir, slug);
  return true;
}

/**
 * Build the `.index.json` entry from a slug by reading its `meta.md`.
 * Used by external callers that need a fresh entry without a full index
 * rebuild.
 * @param appliedDir - The applied directory.
 * @param slug - The application slug.
 * @returns An `ApplicationEntry`, or `null` if the slug doesn't exist
 *   or its `meta.md` is invalid.
 */
export async function getEntryFromSlug(
  appliedDir: string,
  slug: string,
): Promise<ApplicationEntry | null> {
  const folder = join(appliedDir, slug);
  const metaPath = join(folder, 'meta.md');
  if (!existsSync(metaPath)) {
    return null;
  }
  try {
    const { frontmatter } = await readFrontmatter(metaPath);
    const result = ApplicationFrontmatterSchema.safeParse(frontmatter);
    if (!result.success) {
      return null;
    }
    return entryFromFrontmatter(result.data);
  } catch {
    return null;
  }
}

/**
 * Append a note to an application's `jd.md` file below the user notes marker.
 * Creates the marker if it doesn't exist.
 *
 * @param appliedDir - The applied directory.
 * @param slug - The application slug.
 * @param note - The note text to append.
 */
export async function appendNote(appliedDir: string, slug: string, note: string): Promise<void> {
  const folder = join(appliedDir, slug);
  const jdPath = join(folder, 'jd.md');

  if (!existsSync(folder)) {
    throw new ApplicationNotFoundError(slug);
  }

  await acquireLock(folder, async () => {
    let content = '';
    if (existsSync(jdPath)) {
      content = await readFile(jdPath, 'utf8');
    }

    // Add marker if it doesn't exist
    if (!content.includes(USER_NOTES_COMMENT)) {
      content = content.trimEnd() + '\n\n' + USER_NOTES_COMMENT + '\n';
    }

    // Append the note
    content = content.trimEnd() + '\n' + note + '\n';

    const written = await atomicWrite(jdPath, content);
    if (!written) {
      throw new Error(`failed to write jd.md for ${slug}`);
    }
  });
}
