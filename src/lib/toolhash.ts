import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
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
 * Compute a SHA-256 hex digest of `content`.
 * @param content - The bytes to hash.
 * @returns Lowercase hex-encoded SHA-256 digest.
 */
export function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Resolve the `.toolhash` sidecar path for a given file.
 * @param filePath - Absolute path to the tool-managed file.
 * @returns Absolute path to `<filePath>.toolhash`.
 */
export function toolhashPath(filePath: string): string {
  return `${filePath}.toolhash`;
}

/**
 * Read the stored hash from a `.toolhash` sidecar. Returns `null` when
 * the sidecar does not exist or is unreadable — this is expected on
 * first run before any sidecars have been created.
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
      return null;
    }
    log.warn({ sidecar, err }, 'toolhash.read.failed');
    return null;
  }
}

/**
 * Write a `.toolhash` sidecar atomically. The sidecar contains the
 * SHA-256 hex digest of the corresponding file's content.
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
