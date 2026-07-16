import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { SLUG_PATTERN, extractDateFromSlug } from '../parser/slug.js';
import { readFrontmatter } from '../parser/frontmatter.js';
import { safeValidateApplicationFrontmatter } from './meta-schema.js';
import { debug } from '../debug.js';
import { atomicWrite } from '../fs.js';
import type { ApplicationEntry, ApplicationStatus } from './types.js';

const log = debug('index-builder');

/**
 * Filename of the derived index cache inside the applied directory.
 * This file is gitignored and regenerated on every read — it is not
 * meant for human editing.
 */
const INDEX_FILENAME = '.index.json';

/**
 * Sort entries by date descending (newest first), then by slug
 * as a tiebreaker.
 */
function sortBySlugDesc(a: ApplicationEntry, b: ApplicationEntry): number {
  const dA = extractDateFromSlug(a.slug);
  const dB = extractDateFromSlug(b.slug);
  if (dA !== dB) {
    return dB > dA ? 1 : dB < dA ? -1 : 0;
  }
  if (b.slug > a.slug) {
    return 1;
  }
  if (b.slug < a.slug) {
    return -1;
  }
  return 0;
}

/**
 * Resolve the absolute path of `.index.json` for a given applied directory.
 * @param appliedDir - The absolute path to the campaign's `applied/` folder.
 * @returns The absolute path to the index file.
 */
export function indexPath(appliedDir: string): string {
  return resolve(appliedDir, INDEX_FILENAME);
}

/**
 * Read the index file. Returns an empty array if the file is missing,
 * unreadable, or not a valid JSON array. Malformed entries are dropped
 * and logged — the file is derived state and is always safe to discard.
 * @param appliedDir - The absolute path to the campaign's `applied/` folder.
 * @returns A fresh array of `ApplicationEntry`. Safe to mutate.
 */
export async function readIndex(appliedDir: string): Promise<ApplicationEntry[]> {
  const path = indexPath(appliedDir);
  if (!existsSync(path)) {
    return [];
  }
  try {
    const raw = await readFile(path, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      log('index file is not an array, rebuilding: %s', path);
      return [];
    }
    return parsed.filter((entry): entry is ApplicationEntry => {
      return (
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as ApplicationEntry).slug === 'string' &&
        SLUG_PATTERN.test((entry as ApplicationEntry).slug)
      );
    });
  } catch (err) {
    log('failed to read index file, rebuilding: %s (%s)', path, String(err));
    return [];
  }
}

/**
 * Build a single `ApplicationEntry` by reading a folder's `meta.md`
 * frontmatter. Returns `null` if the folder doesn't contain a valid
 * `meta.md` or the frontmatter fails validation. Failures are logged.
 * @param folderPath - Absolute path to the application folder (e.g. `applied/2026-Jun-03-...`).
 * @returns An `ApplicationEntry` or `null` on failure.
 */
async function entryFromFolder(folderPath: string): Promise<ApplicationEntry | null> {
  const metaPath = join(folderPath, 'meta.md');
  if (!existsSync(metaPath)) {
    return null;
  }
  try {
    const { frontmatter } = await readFrontmatter(metaPath);
    const result = safeValidateApplicationFrontmatter(frontmatter as Record<string, unknown>);
    if (!result.success) {
      log(
        'invalid meta.md frontmatter in %s: %s',
        folderPath,
        result.issues.map((iss) => iss.message).join(', '),
      );
      return null;
    }
    const fm = result.data;
    return {
      slug: fm.slug,
      status: fm.status as ApplicationStatus,
      title: fm.title,
      company: fm.company,
      site: fm.site,
      location: fm.location,
      targetRole: fm.targetRole,
      employmentType: fm.employmentType,
      appliedOn: fm.appliedOn,
      tags: fm.tags,
    };
  } catch (err) {
    log('failed to read meta.md in %s: %s', folderPath, String(err));
    return null;
  }
}

/**
 * Scan the `applied/` directory and build a fresh index from all
 * application folders. Only folders whose name matches `SLUG_PATTERN`
 * are included. Invalid or unreadable `meta.md` files are silently
 * skipped.
 * @param appliedDir - The absolute path to the campaign's `applied/` folder.
 * @returns A sorted array of `ApplicationEntry` (sorted by slug descending, newest first).
 */
export async function buildIndex(appliedDir: string): Promise<ApplicationEntry[]> {
  if (!existsSync(appliedDir)) {
    return [];
  }
  const entries = await readdir(appliedDir, { withFileTypes: true });
  const folders = entries.filter((ent) => ent.isDirectory() && SLUG_PATTERN.test(ent.name));
  const results: ApplicationEntry[] = [];
  for (const folder of folders) {
    const entry = await entryFromFolder(join(appliedDir, folder.name));
    if (entry) {
      results.push(entry);
    }
  }
  results.sort(sortBySlugDesc);
  return results;
}

/**
 * Write the index file atomically. Sorts entries by slug descending
 * (newest first) and formats with 2-space indent + trailing newline.
 * Creates the `applied/` directory if it doesn't exist.
 * @param appliedDir - The absolute path to the campaign's `applied/` folder.
 * @param entries - The entries to write.
 * @returns `true` on success.
 */
export async function writeIndex(
  appliedDir: string,
  entries: ApplicationEntry[],
): Promise<boolean> {
  const sorted = [...entries].sort(sortBySlugDesc);
  const json = JSON.stringify(sorted, null, 2) + '\n';
  return atomicWrite(indexPath(appliedDir), json, { ensureDir: true });
}

/**
 * Rebuild the index from scratch and write it. This is the main entry
 * point for refreshing the cache. Returns the rebuilt entries.
 * @param appliedDir - The absolute path to the campaign's `applied/` folder.
 * @returns The rebuilt, sorted array of `ApplicationEntry`.
 */
export async function rebuildIndex(appliedDir: string): Promise<ApplicationEntry[]> {
  const entries = await buildIndex(appliedDir);
  const written = await writeIndex(appliedDir, entries);
  if (!written) {
    log('rebuildIndex: index write failed, entries built but not persisted');
  }
  return entries;
}

/**
 * Add or update a single entry in the index. If an entry with the same
 * slug already exists, it is replaced. The entry is upserted and the
 * index is rewritten atomically.
 * @param appliedDir - The absolute path to the campaign's `applied/` folder.
 * @param entry - The entry to add or update.
 * @returns `true` if the index was written successfully.
 */
export async function upsertIndexEntry(
  appliedDir: string,
  entry: ApplicationEntry,
): Promise<boolean> {
  const entries = await readIndex(appliedDir);
  const existing = entries.findIndex((item) => item.slug === entry.slug);
  if (existing >= 0) {
    entries[existing] = entry;
  } else {
    entries.push(entry);
  }
  return writeIndex(appliedDir, entries);
}

/**
 * Remove a single entry from the index by slug. No-op if the slug
 * doesn't exist. Rewrites the index atomically.
 * @param appliedDir - The absolute path to the campaign's `applied/` folder.
 * @param slug - The slug of the entry to remove.
 * @returns `true` if the index was written successfully, `false` if no entry was removed.
 */
export async function removeIndexEntry(appliedDir: string, slug: string): Promise<boolean> {
  const entries = await readIndex(appliedDir);
  const filtered = entries.filter((item) => item.slug !== slug);
  if (filtered.length !== entries.length) {
    return writeIndex(appliedDir, filtered);
  }
  return false;
}
