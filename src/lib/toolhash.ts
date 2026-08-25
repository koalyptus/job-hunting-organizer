import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { moduleLogger } from './logger/logger.js';

const log = moduleLogger(import.meta.url);

/**
 * Files whose content is owned by the tool (see AGENTS.md "File ownership model").
 * Used by doctor and repair to decide which files to check/fix.
 */
export const TOOL_MANAGED_FILES = [
  'meta.md',
  'jd.md',
  'cover-letter.md',
  'prepare.md',
  'interviews.md',
  'retro.md',
] as const;

/**
 * Subdirectory inside each application folder where toolhash sidecars live.
 * Sidecars are kept here so the application folder shows only the user-facing
 * tool-managed files (meta.md, jd.md, …) and is not polluted by `<file>.toolhash`
 * siblings. This replaced the older sibling-sidecar layout in phase 10a.
 */
export const SIDECARS_DIR = '.sidecars';

/**
 * Compute a SHA-256 hex digest of `content`.
 * @param content - The bytes to hash.
 * @returns Lowercase hex-encoded SHA-256 digest.
 */
export function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Resolve the sidecar path for a given tool-managed file. The sidecar lives in
 * the `.sidecars/` subdirectory next to the file, named `<basename>.toolhash`,
 * so the application folder is not polluted by sibling `.toolhash` files.
 *
 * @param filePath - Absolute path to the tool-managed file.
 * @returns Absolute path to `.sidecars/<basename>.toolhash` beside the file.
 */
export function toolhashPath(filePath: string): string {
  return join(dirname(filePath), SIDECARS_DIR, `${basename(filePath)}.toolhash`);
}

/**
 * Resolve the legacy (pre-phase-10a) sidecar path — the `<file>.toolhash`
 * sibling that older versions of the tool wrote directly into the
 * application folder. Used only for migration and graceful fallback.
 *
 * @param filePath - Absolute path to the tool-managed file.
 * @returns Absolute path to `<filePath>.toolhash`.
 */
export function legacyToolhashPath(filePath: string): string {
  return `${filePath}.toolhash`;
}

/**
 * Read the stored hash from the sidecar. Looks in the current
 * `.sidecars/` location first; if absent, transparently falls back to the
 * legacy sibling sidecar so existing data keeps working after the upgrade.
 * Returns `null` when no sidecar exists or neither location is readable —
 * this is expected on first run before any sidecars have been created.
 *
 * @param filePath - Absolute path to the tool-managed file.
 * @returns The stored hash string, or `null`.
 */
export async function readToolhash(filePath: string): Promise<string | null> {
  const sidecar = toolhashPath(filePath);
  try {
    const content = await readFile(sidecar, 'utf8');
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      return null;
    }
    return trimmed;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      log.debug({ sidecar }, 'toolhash.missing');
    } else {
      log.warn({ sidecar, err }, 'toolhash.read.failed');
      return null;
    }
  }

  // Graceful fallback: legacy sibling sidecar written by pre-10a versions.
  const legacy = legacyToolhashPath(filePath);
  try {
    const content = await readFile(legacy, 'utf8');
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      return null;
    }
    return trimmed;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      log.debug({ legacy }, 'toolhash.legacy.missing');
      return null;
    }
    log.warn({ legacy, err }, 'toolhash.legacy.read.failed');
    return null;
  }
}

/**
 * Write the sidecar to the `.sidecars/` directory, creating it if needed.
 * The sidecar contains the SHA-256 hex digest of the corresponding file's content.
 *
 * @param filePath - Absolute path to the tool-managed file.
 * @param hash - The SHA-256 hex digest to persist.
 * @returns `true` on success.
 */
export async function writeToolhash(filePath: string, hash: string): Promise<boolean> {
  const sidecar = toolhashPath(filePath);
  try {
    await mkdir(dirname(sidecar), { recursive: true });
    await writeFile(sidecar, hash + '\n', 'utf8');
    log.debug({ sidecar }, 'toolhash.written');
    return true;
  } catch (err) {
    log.warn({ sidecar, err }, 'toolhash.write.failed');
    return false;
  }
}

/**
 * Move a legacy sibling sidecar (`<file>.toolhash`) into the current
 * `.sidecars/` location for the same file. No-op (returns `false`) when the
 * legacy sidecar does not exist or the new sidecar already exists.
 * Safe to call repeatedly; it never overwrites an existing `.sidecars` entry.
 *
 * @param filePath - Absolute path to the tool-managed file.
 * @returns `true` when a legacy sidecar was moved into `.sidecars/`.
 */
export async function migrateToolhashSidecar(filePath: string): Promise<boolean> {
  const legacy = legacyToolhashPath(filePath);
  const sidecar = toolhashPath(filePath);
  try {
    await readFile(legacy, 'utf8');
  } catch {
    return false;
  }
  try {
    await readFile(sidecar, 'utf8');
    // New location already has a sidecar — drop the legacy one so the
    // application folder is clean.
    await removeLegacySidecar(filePath);
    return false;
  } catch {
    // New location absent — proceed with the move.
  }
  try {
    await mkdir(dirname(sidecar), { recursive: true });
    await rename(legacy, sidecar);
    log.info({ from: legacy, to: sidecar }, 'toolhash.migrated');
    return true;
  } catch (err) {
    log.warn({ from: legacy, to: sidecar, err }, 'toolhash.migrate.failed');
    return false;
  }
}

/**
 * Remove a legacy sibling sidecar if present. Best-effort; ignores errors.
 *
 * @param filePath - Absolute path to the tool-managed file.
 */
export async function removeLegacySidecar(filePath: string): Promise<void> {
  const legacy = legacyToolhashPath(filePath);
  try {
    await unlink(legacy);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      log.debug({ legacy, err }, 'toolhash.legacy.remove.failed');
    }
  }
}

/**
 * Detect whether an application folder still contains legacy sibling sidecars
 * (`<file>.toolhash`) that have not yet been migrated into `.sidecars/`.
 *
 * @param appFolder - Absolute path to the application folder.
 * @returns `true` when at least one legacy sibling sidecar is present.
 */
export async function hasLegacyToolhashSidecars(appFolder: string): Promise<boolean> {
  let entries: string[];
  try {
    entries = await readdir(appFolder);
  } catch {
    return false;
  }
  return entries.some((name) => name.endsWith('.toolhash'));
}
