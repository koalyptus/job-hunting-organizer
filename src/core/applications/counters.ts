import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { atomicWrite } from '../fs.js';
import { getRootLogger } from '../logger.js';
import type { Counters } from '../types.js';

/**
 * Filename of the counters file inside the applied directory.
 * Exposed as a constant so tests and other modules can reference it
 * without re-typing the literal.
 */
const COUNTERS_FILENAME = '.counters.json';

/**
 * Resolve the absolute path of the `.counters.json` file for a given
 * applied directory.
 * @param appliedDir - The absolute path to the campaign's `applied/` folder.
 * @returns The absolute path to the counters file.
 */
function countersPath(appliedDir: string): string {
  return resolve(appliedDir, COUNTERS_FILENAME);
}

/**
 * Read the counters file. Returns an empty record if the file is missing,
 * unreadable, or not a valid JSON object. Malformed entries (non-numbers,
 * negative, non-integer) are silently dropped — the file is derived
 * state and is always safe to discard.
 * @param appliedDir - The absolute path to the campaign's `applied/` folder.
 * @returns A fresh `Counters` object. Safe to mutate; not a shared reference.
 */
export function readCounters(appliedDir: string): Counters {
  const path = countersPath(appliedDir);
  if (!existsSync(path)) {
    return {};
  }
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: Counters = {};
    for (const [slug, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
        out[slug] = value;
      }
    }
    return out;
  } catch (err) {
    getRootLogger().debug({ err }, 'failed to read counters, returning empty');
    return {};
  }
}

/**
 * Read the stored collision suffix for `baseSlug`. Returns the highest
 * suffix value that has been recorded (0 if no collision has been
 * recorded yet). The caller adds 1 to compute the next suffix to use.
 *
 * Pure read — does not modify the file. The caller is responsible for
 * writing the new counter back (see `core/fs.ts` + `core/locks.ts` for
 * the atomic write + lock dance).
 *
 * Named `readCollisionSuffix` (not `nextCollisionSuffix`) because it
 * reads the *current* value, not the next one — the offset-by-one is
 * the caller's job.
 * @param baseSlug - The base slug (without any `-N` suffix).
 * @param appliedDir - The absolute path to the campaign's `applied/` folder.
 * @returns The highest stored suffix, or `0` if no collision yet.
 */
export function readCollisionSuffix(baseSlug: string, appliedDir: string): number {
  const counters = readCounters(appliedDir);
  return counters[baseSlug] ?? 0;
}

/**
 * Read the counters file asynchronously. Returns an empty record if the
 * file is missing, unreadable, or not a valid JSON object.
 * @param appliedDir - The absolute path to the campaign's `applied/` folder.
 * @returns A fresh `Counters` object.
 */
export async function readCountersAsync(appliedDir: string): Promise<Counters> {
  const path = resolve(appliedDir, COUNTERS_FILENAME);
  try {
    const raw = await readFile(path, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    // Guard against null, non-objects, and arrays (possible with manual edits)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: Counters = {};
    for (const [slug, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
        out[slug] = value;
      }
    }
    return out;
  } catch (err) {
    getRootLogger().debug({ err }, 'failed to read counters async, returning empty');
    return {};
  }
}

/**
 * Write the counters file asynchronously using atomic write.
 * @param appliedDir - The absolute path to the campaign's `applied/` folder.
 * @param counters - The counters to write.
 * @returns `true` on success.
 */
export async function writeCountersAsync(appliedDir: string, counters: Counters): Promise<boolean> {
  const path = resolve(appliedDir, COUNTERS_FILENAME);
  return atomicWrite(path, JSON.stringify(counters, null, 2) + '\n');
}
