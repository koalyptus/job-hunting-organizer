import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Counters } from './types.js';

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
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0) {
        out[k] = v;
      }
    }
    return out;
  } catch {
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
