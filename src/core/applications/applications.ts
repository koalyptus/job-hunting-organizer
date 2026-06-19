import { mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { uniqueSlug } from '../slug.js';
import { writeFrontmatter, readFrontmatter, mergeFrontmatter } from '../frontmatter.js';
import { atomicWrite } from '../fs.js';
import { acquireLock } from '../locks.js';
import { getRootLogger } from '../logger.js';
import { MetaFrontmatterSchema } from './meta-schema.js';
import { upsertIndexEntry, removeIndexEntry, readIndex, rebuildIndex } from './index-builder.js';
import { replaceRegion } from '../markers.js';
import { toIsoDateString, todayIso } from '../date.js';
import type {
  ApplicationEntry,
  ApplicationStatus,
  CreateApplicationInput,
  UpdateApplicationInput,
  MetaFrontmatter,
  Frontmatter,
} from '../types.js';

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
  if (patch.tags !== undefined) {
    updates.tags = [...new Set([...existingTags, ...patch.tags])];
  }
  return updates;
}

/**
 * Build an `ApplicationEntry` from a `MetaFrontmatter` object.
 * @param fm - The validated frontmatter.
 * @returns An `ApplicationEntry` suitable for the index.
 */
function entryFromFrontmatter(fm: MetaFrontmatter): ApplicationEntry {
  return {
    slug: fm.slug,
    status: fm.status,
    title: fm.title,
    company: fm.company,
    site: fm.site,
    targetRole: fm.targetRole,
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
    );

    const folder = join(appliedDir, slug);
    await mkdir(folder, { recursive: true });

    const appliedOn = input.appliedOn !== undefined ? toIsoDateString(input.appliedOn) : todayIso();

    const fm: MetaFrontmatter = {
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
    };

    const metaWritten = await writeFrontmatter(
      join(folder, 'meta.md'),
      fm as unknown as Frontmatter,
      '',
    );
    if (!metaWritten) {
      throw new Error(`failed to write meta.md for ${slug}`);
    }
    const jdContent = replaceRegion('', 'fetched-jd', '', { createIfMissing: true });
    const jdWritten = await atomicWrite(
      join(folder, 'jd.md'),
      jdContent + '\n' + USER_NOTES_COMMENT + '\n',
    );
    if (!jdWritten) {
      throw new Error(`failed to write jd.md for ${slug}`);
    }

    const entry = entryFromFrontmatter(fm);
    await upsertIndexEntry(appliedDir, entry);

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
 * @returns `true` on success.
 * @throws If the application folder or `meta.md` doesn't exist.
 */
export async function updateApplication(
  appliedDir: string,
  slug: string,
  patch: UpdateApplicationInput,
): Promise<boolean> {
  const folder = join(appliedDir, slug);
  const metaPath = join(folder, 'meta.md');

  if (!existsSync(metaPath)) {
    throw new Error(`application not found: ${slug}`);
  }

  await acquireLock(folder, async () => {
    const { frontmatter, body } = await readFrontmatter(metaPath);

    const existingTags = Array.isArray(frontmatter['tags'])
      ? (frontmatter['tags'] as string[])
      : [];
    const updates = buildUpdates(patch, existingTags);

    const merged = mergeFrontmatter(frontmatter, updates);
    const written = await writeFrontmatter(metaPath, merged, body);
    if (!written) {
      throw new Error(`failed to write meta.md for ${slug}`);
    }

    const result = MetaFrontmatterSchema.safeParse(merged);
    if (result.success) {
      await upsertIndexEntry(appliedDir, entryFromFrontmatter(result.data));
    } else {
      getRootLogger().warn(
        { slug, issues: result.error.issues },
        'meta.md validation failed, index not updated',
      );
    }
  });
  return true;
}

/**
 * Read an application's validated frontmatter.
 * @param appliedDir - The applied directory.
 * @param slug - The application slug.
 * @returns The validated `MetaFrontmatter` and the raw body text.
 * @throws If the application doesn't exist or frontmatter is invalid.
 */
export async function readApplication(
  appliedDir: string,
  slug: string,
): Promise<{ frontmatter: MetaFrontmatter; body: string }> {
  const folder = join(appliedDir, slug);
  const metaPath = join(folder, 'meta.md');

  if (!existsSync(metaPath)) {
    throw new Error(`application not found: ${slug}`);
  }

  const { frontmatter, body } = await readFrontmatter(metaPath);
  const result = MetaFrontmatterSchema.parse(frontmatter);
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
    tag?: string;
  },
): Promise<ApplicationEntry[]> {
  let entries = await readIndex(appliedDir);
  if (entries.length === 0 && existsSync(appliedDir)) {
    entries = await rebuildIndex(appliedDir);
  }

  if (filters) {
    if (filters.status) {
      entries = entries.filter((e) => e.status === filters.status);
    }
    if (filters.targetRole) {
      entries = entries.filter((e) => e.targetRole === filters.targetRole);
    }
    if (filters.tag) {
      entries = entries.filter((e) => e.tags.includes(filters.tag!));
    }
  }

  return entries;
}

/**
 * Delete an application folder and remove it from the index.
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
    const result = MetaFrontmatterSchema.safeParse(frontmatter);
    if (!result.success) {
      return null;
    }
    return entryFromFrontmatter(result.data);
  } catch {
    return null;
  }
}
