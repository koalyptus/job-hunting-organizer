import { readFile } from 'node:fs/promises';
import { dump, load, YAMLException } from 'js-yaml';
import { atomicWrite } from './fs.js';
import type { Frontmatter, ParsedFile } from './types.js';

/**
 * Thrown when the YAML in a frontmatter block cannot be parsed, or when
 * it decodes to something other than a mapping (e.g. an array or scalar).
 * The original `YAMLException` is attached as `cause`.
 */
export class FrontmatterParseError extends Error {
  override readonly cause?: unknown;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'FrontmatterParseError';
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/**
 * Matches a YAML frontmatter block at the very start of the file.
 * Captures: (1) YAML contents, (2) everything after the closing `---`.
 * The closing `---` must be on its own line, optionally followed by a
 * single newline that separates the block from the body.
 */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?([\s\S]*)$/;

/**
 * Split a file's contents into its frontmatter and body. If the file
 * does not start with a `---` block, the entire content is returned as
 * the body and the frontmatter is `{}`.
 * @param content - The full file contents.
 * @returns The parsed frontmatter and body.
 * @throws {FrontmatterParseError} If the YAML is invalid or does not decode to a mapping.
 */
export function parseFrontmatter(content: string): ParsedFile {
  const m = content.match(FRONTMATTER_RE);
  if (!m || m[1] === undefined) {
    return { frontmatter: {}, body: content };
  }
  const yamlText = m[1];
  const body = m[2] ?? '';
  if (yamlText.trim() === '') {
    return { frontmatter: {}, body };
  }
  let parsed: unknown;
  try {
    parsed = load(yamlText);
  } catch (err) {
    if (err instanceof YAMLException) {
      throw new FrontmatterParseError(`invalid YAML in frontmatter: ${err.reason}`, {
        cause: err,
      });
    }
    throw new FrontmatterParseError('invalid YAML in frontmatter', { cause: err });
  }
  if (parsed === null || parsed === undefined) {
    return { frontmatter: {}, body };
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new FrontmatterParseError('frontmatter must be a YAML mapping');
  }
  return { frontmatter: parsed as Frontmatter, body };
}

/**
 * Serialize a frontmatter + body pair into a full file string. Key
 * insertion order is preserved (`sortKeys: false`) so user custom
 * fields keep their position on round-trip. Long strings are not
 * wrapped (`lineWidth: -1`).
 * @param fm - The frontmatter mapping to serialize.
 * @param body - The body text. Leading newlines are stripped to keep the
 *   YAML/body boundary clean.
 * @returns The full file content, ending with a single trailing newline
 *   if the body is non-empty.
 */
export function serializeFrontmatter(fm: Frontmatter, body: string): string {
  const yaml = dump(fm, {
    noRefs: true,
    lineWidth: -1,
    sortKeys: false,
    quotingType: '"',
  });
  const trimmedBody = body.replace(/^\n+/, '');
  return `---\n${yaml}---\n${trimmedBody}`;
}

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
 * @param fm - The frontmatter mapping to write.
 * @param body - The body text to write.
 * @returns `true` on success.
 */
export async function writeFrontmatter(
  path: string,
  fm: Frontmatter,
  body: string,
): Promise<boolean> {
  const content = serializeFrontmatter(fm, body);
  return atomicWrite(path, content, { encoding: 'utf8' });
}

/**
 * Shallow-merge two frontmatter mappings. Keys in `updates` overwrite
 * keys in `existing`; keys in `existing` not mentioned by `updates` are
 * preserved. This is the mechanism that keeps user-added custom fields
 * intact across tool rewrites.
 *
 * Deep-merge is intentionally NOT provided — frontmatter is a flat
 * mapping and nesting would invite ambiguity.
 * @param existing - The current frontmatter.
 * @param updates - The fields to add or overwrite.
 * @returns A new merged object.
 */
export function mergeFrontmatter(existing: Frontmatter, updates: Frontmatter): Frontmatter {
  return { ...existing, ...updates };
}
