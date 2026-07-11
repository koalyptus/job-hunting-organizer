import { rename } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { isUnder } from '../paths.js';
import { SLUG_PATTERN } from '../slug.js';
import { acquireLock } from '../locks.js';
import { readFrontmatter, mergeFrontmatter, writeFrontmatter } from '../frontmatter.js';
import { rebuildIndex } from './index-builder.js';
import { childLogger } from '../logger/logger.js';
import type { Frontmatter } from '../types.js';

const log = childLogger({ cmd: 'rename-application' });

/** Error thrown when rename validation or pre-flight checks fail. */
export class RenameApplicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RenameApplicationError';
  }
}

/** Rejection when the new slug fails validation. */
export class InvalidSlugError extends RenameApplicationError {
  constructor(slug: string) {
    super(`invalid application slug "${slug}"`);
    this.name = 'InvalidSlugError';
  }
}

/** Rejection when renaming the application the user is currently inside. */
export class SelfRenameError extends RenameApplicationError {
  constructor(oldSlug: string) {
    super(`refusing to rename application "${oldSlug}" while cwd is inside it`);
    this.name = 'SelfRenameError';
  }
}

/**
 * Rename an application folder. Validates the new slug, acquires a lock,
 * performs an atomic rename, updates `meta.md` frontmatter, and rebuilds
 * the index.
 *
 * @param appliedDir - The absolute path to the campaign's `applied/` directory.
 * @param oldSlug - The current application slug (folder name).
 * @param newSlug - The desired new slug.
 * @throws {InvalidSlugError} if `newSlug` does not match {@link SLUG_PATTERN}.
 * @throws {SelfRenameError} if cwd is inside the application folder.
 * @throws {RenameApplicationError} on other pre-flight failures.
 */
export async function renameApplication(
  appliedDir: string,
  oldSlug: string,
  newSlug: string,
): Promise<void> {
  if (!SLUG_PATTERN.test(newSlug)) {
    throw new InvalidSlugError(newSlug);
  }

  const oldFolder = join(appliedDir, oldSlug);
  const newFolder = join(appliedDir, newSlug);

  if (isUnder(process.cwd(), oldFolder)) {
    throw new SelfRenameError(oldSlug);
  }

  if (!existsSync(oldFolder)) {
    throw new RenameApplicationError(`application "${oldSlug}" not found`);
  }

  const start = performance.now();
  await acquireLock(appliedDir, async () => {
    if (existsSync(newFolder)) {
      throw new RenameApplicationError(`application "${newSlug}" already exists`);
    }

    await rename(oldFolder, newFolder);

    const metaPath = join(newFolder, 'meta.md');
    if (existsSync(metaPath)) {
      const { frontmatter, body } = await readFrontmatter(metaPath);
      const updated = mergeFrontmatter(frontmatter, { slug: newSlug } as Frontmatter);
      await writeFrontmatter(metaPath, updated, body);
    }

    await rebuildIndex(appliedDir);
  });

  log.debug(
    { old: oldSlug, new: newSlug, durationMs: Math.round(performance.now() - start) },
    'application.renamed',
  );
}
