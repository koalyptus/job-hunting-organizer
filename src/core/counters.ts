import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Collision counters for application folder slugs. When the user applies
 * to the same role+company on the same day (or re-applies later), a `-N`
 * suffix is appended; the next free `N` is looked up here.
 *
 * The file lives at `<appliedDir>/.counters.json` and is gitignored
 * (derived state — see AGENTS.md "applied/.counters.json" row).
 */
export interface Counters {
  [baseSlug: string]: number;
}

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
    const parsed = JSON.parse(raw) as unknown;
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
 * Return the next integer suffix to append to `baseSlug` to avoid a
 * collision. Returns `0` if no collision has been recorded, or the
 * highest stored suffix (caller adds 1 to use it).
 *
 * Pure read — does not modify the file. The caller is responsible for
 * writing the new counter back (see `core/fs.ts` + `core/locks.ts` for
 * the atomic write + lock dance).
 * @param baseSlug - The base slug (without any `-N` suffix).
 * @param appliedDir - The absolute path to the campaign's `applied/` folder.
 * @returns The next suffix to use (0 means "no collision yet").
 */
export function nextCollisionSuffix(baseSlug: string, appliedDir: string): number {
  const counters = readCounters(appliedDir);
  return counters[baseSlug] ?? 0;
}
