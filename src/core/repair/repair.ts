import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { computeHash, writeToolhash, TOOL_MANAGED_FILES } from '../toolhash.js';
import { rebuildIndex } from '../applications/index-builder.js';
import { readCounters, writeCountersAsync } from '../applications/counters.js';
import { acquireLock } from '../locks.js';
import { moduleLogger } from '../logger/logger.js';
import { SLUG_PATTERN } from '../slug.js';
import type { RepairAction, RepairResult, RepairOptions } from './types.js';

const log = moduleLogger(import.meta.url);

/**
 * Thrown when a repair operation encounters a fatal error.
 */
export class RepairError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepairError';
  }
}

/**
 * Repair a single application: update toolhash sidecars to match
 * current file contents. Locks the application folder for the duration.
 *
 * @param appliedDir - Absolute path to the campaign's `applied/` directory.
 * @param slug - The application slug to repair.
 * @param options - Repair options.
 * @returns The repair actions taken.
 * @throws {RepairError} if the application folder doesn't exist.
 */
export async function repairApp(
  appliedDir: string,
  slug: string,
  options: RepairOptions = {},
): Promise<RepairResult> {
  const appFolder = join(appliedDir, slug);

  if (!existsSync(appFolder)) {
    throw new RepairError(`application folder not found: ${slug}`);
  }

  const updateToolhash = options.updateToolhash ?? true;

  return acquireLock(appFolder, async () => {
    const actions: RepairAction[] = [];

    if (updateToolhash) {
      for (const filename of TOOL_MANAGED_FILES) {
        const filePath = join(appFolder, filename);
        if (!existsSync(filePath)) {
          continue;
        }

        try {
          const content = await readFile(filePath, 'utf8');
          const hash = computeHash(content);
          const written = await writeToolhash(filePath, hash);
          if (written) {
            actions.push({
              action: 'toolhash_updated',
              message: `Updated sidecar for ${filename}.`,
              slug,
            });
          }
        } catch (err) {
          log.debug({ slug, filename, err }, 'repair.toolhash.skip');
        }
      }
    }

    log.info({ slug, actionCount: actions.length }, 'repair.app.completed');
    return { actions, isIndexRebuilt: false };
  });
}

/**
 * Repair an entire campaign: rebuild the index and counters from the
 * folder listing. Locks the campaign root for the duration.
 *
 * @param campaignRoot - Absolute path to the campaign root.
 * @returns The repair actions taken.
 */
export async function repairAll(campaignRoot: string): Promise<RepairResult> {
  const appliedDir = join(campaignRoot, 'applied');

  if (!existsSync(appliedDir)) {
    return { actions: [], isIndexRebuilt: false };
  }

  return acquireLock(campaignRoot, async () => {
    const actions: RepairAction[] = [];

    // Rebuild index
    const entries = await rebuildIndex(appliedDir);
    actions.push({
      action: 'index_rebuilt',
      message: `Rebuilt index with ${entries.length} entries.`,
      slug: null,
    });

    // Rebuild counters from folder names
    const folders = await readdir(appliedDir, { withFileTypes: true });
    const slugFolders = folders
      .filter((entry) => entry.isDirectory() && SLUG_PATTERN.test(entry.name))
      .map((entry) => entry.name);

    // Extract highest -N suffix per base slug
    const rebuiltCounters: Record<string, number> = {};
    for (const folder of slugFolders) {
      // Match trailing -N where N is a number
      const match = folder.match(/^(.+)-(\d+)$/);
      if (match) {
        const baseSlug = match[1]!;
        const suffix = parseInt(match[2]!, 10);
        const current = rebuiltCounters[baseSlug] ?? 0;
        if (suffix > current) {
          rebuiltCounters[baseSlug] = suffix;
        }
      }
    }

    // Only write if different from current
    const currentCounters = readCounters(appliedDir);
    const needsUpdate = Object.keys(rebuiltCounters).some(
      (key) => (rebuiltCounters[key] ?? 0) > (currentCounters[key] ?? 0),
    );

    if (needsUpdate) {
      const merged = { ...currentCounters };
      for (const [key, value] of Object.entries(rebuiltCounters)) {
        if ((value ?? 0) > (merged[key] ?? 0)) {
          merged[key] = value!;
        }
      }
      await writeCountersAsync(appliedDir, merged);
      actions.push({
        action: 'counters_rebuilt',
        message: 'Rebuilt collision counters from folder names.',
        slug: null,
      });
    }

    // Repair each application's toolhash
    for (const slug of slugFolders) {
      try {
        const result = await repairApp(appliedDir, slug);
        actions.push(...result.actions);
      } catch (err) {
        log.debug({ slug, err }, 'repair.app.skipped');
      }
    }

    log.info({ actionCount: actions.length }, 'repair.all.completed');
    return { actions, isIndexRebuilt: true };
  });
}
