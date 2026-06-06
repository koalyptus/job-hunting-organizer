import { readFile } from 'node:fs/promises';
import { dump, load, YAMLException } from 'js-yaml';
import { atomicWrite } from './fs.js';

export interface Frontmatter {
  [key: string]: unknown;
}

export interface ParsedFile {
  frontmatter: Frontmatter;
  body: string;
}

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

// Matches a YAML frontmatter block at the very start of the file.
// Captures: (1) YAML contents, (2) everything after the closing `---`.
// The closing `---` must be on its own line, optionally followed by a
// single newline that separates the block from the body.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?([\s\S]*)$/;

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

export function serializeFrontmatter(fm: Frontmatter, body: string): string {
  // `sortKeys: false` preserves insertion order so user custom fields
  // keep their position on round-trip.
  // `lineWidth: -1` prevents js-yaml from wrapping long strings.
  const yaml = dump(fm, {
    noRefs: true,
    lineWidth: -1,
    sortKeys: false,
    quotingType: '"',
  });
  const trimmedBody = body.replace(/^\n+/, '');
  return `---\n${yaml}---\n${trimmedBody}`;
}

export async function readFrontmatter(path: string): Promise<ParsedFile> {
  const content = await readFile(path, 'utf8');
  return parseFrontmatter(content);
}

export async function writeFrontmatter(path: string, fm: Frontmatter, body: string): Promise<void> {
  const content = serializeFrontmatter(fm, body);
  await atomicWrite(path, content, { encoding: 'utf8' });
}

// Shallow merge: tool-known fields overwrite existing values; unknown
// fields are preserved. Custom user fields are kept as-is. Deep-merge
// is intentionally not provided — frontmatter is a flat mapping.
export function mergeFrontmatter(existing: Frontmatter, updates: Frontmatter): Frontmatter {
  return { ...existing, ...updates };
}
