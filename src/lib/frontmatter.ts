/**
 * Frontmatter I/O operations for tool-managed files.
 * Moved to `lib/frontmatter.ts` as part of the infrastructure extraction
 * (Phase 9j) — this module touches the filesystem via `node:fs` and
 * the `FileStore`-style `atomicWrite` helper, so it lives in the
 * infrastructure layer (`src/lib/`), not the pure core.
 *
 * The pure parsing/serialization lives in `core/parser/frontmatter.ts`.
 */

import { readFile } from 'node:fs/promises';
import { parseFrontmatter, serializeFrontmatter } from '../core/parser/frontmatter.js';
import { atomicWrite } from './fs.js';
import type { Frontmatter, ParsedFile } from '../core/types.js';

/**
 * Read a file and parse its frontmatter.
 * @param path - The absolute path to the file.
 * @returns The parsed frontmatter and body.
 * @throws {FrontmatterParseError} If the file has invalid YAML frontmatter.
 * @throws {NodeJS.ErrnoException} If the file cannot be read.
 */
export async function readFrontmatter(path: string): Promise<ParsedFile> {
  const content = await readFile(path, 'utf8');
  return parseFrontmatter(content);
}

/**
 * Write a frontmatter + body to a file atomically (via
 * {@link atomicWrite}). Safe to call on files the user may have edited
 * concurrently — the tool-managed region is bounded by markers and
 * the body's user edits are preserved.
 * @param path - The absolute path to write to.
 * @param frontmatter - The frontmatter mapping to write.
 * @param body - The body text to write.
 * @returns `true` on success.
 */
export async function writeFrontmatter(
  path: string,
  frontmatter: Frontmatter,
  body: string,
): Promise<boolean> {
  const content = serializeFrontmatter(frontmatter, body);
  return atomicWrite(path, content, { encoding: 'utf8' });
}
