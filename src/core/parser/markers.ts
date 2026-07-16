// In-file markers separate tool-managed regions from user-edited regions.
// Regions are delimited by paired HTML comments on their own lines:
//
//   <!-- jho:start:<name> -->
//   ...tool-managed content...
//   <!-- jho:end:<name> -->
//
// On re-track / re-generate, the tool replaces the content BETWEEN the markers
// and preserves everything else. The closing line of the file is also owned
// by the user (typically `<!-- user notes below this line are preserved -->`).
//
// Single-line "section" markers (`<!-- jho:meta — ... -->`) are informational
// only; they are matched by a different regex and do not denote a region.

import type { RegionName, Region, ReplaceRegionOptions } from '../types.js';

/**
 * The set of region names the tool currently emits. Used by
 * {@link isKnownRegionName} to validate input and by `jho ownership`
 * to enumerate tool-managed regions. Add new names here when you
 * introduce a new tool-managed file.
 *
 * This is the runtime source of truth; the {@link RegionName} type
 * alias in `core/types.ts` is a literal union of the same strings.
 * The two are checked for parity by the test suite.
 */
export const REGION_MARKER_NAMES = [
  'fetched-jd',
  'tool-output',
  'cover-letter',
  'prepare',
] as const;

/**
 * Matches a region start marker line. Group 1 is the region name.
 * Allows trailing whitespace.
 */
const START_LINE_RE = /^<!-- jho:start:([a-z0-9-]+) -->\s*$/;

/**
 * Matches a region end marker line. Group 1 is the region name.
 */
const END_LINE_RE = /^<!-- jho:end:([a-z0-9-]+) -->\s*$/;

/**
 * Matches a single-line "section" marker like `<!-- jho:meta — ... -->`.
 * Group 1 is the section name; the remainder is free-form text.
 */
const SECTION_LINE_RE = /^<!-- jho:([a-z0-9-]+) [^>]+-->\s*$/;

/**
 * Matches a steer marker line: `<!-- jho:steer: ... -->`.
 * Group 1 is the steer text (trimmed).
 */
const STEER_LINE_RE = /^<!-- jho:steer: (.+) -->\s*$/;

/**
 * Thrown when a document contains malformed marker regions (mismatched
 * start/end names, end without start, or unclosed start markers).
 */
export class MarkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarkerError';
  }
}

/**
 * Type guard that narrows a string to {@link RegionName} if it is a
 * known region name from {@link REGION_MARKER_NAMES}.
 * @param name - The string to test.
 * @returns `true` if `name` is a known region name.
 */
export function isKnownRegionName(name: string): name is RegionName {
  return (REGION_MARKER_NAMES as readonly string[]).includes(name);
}

/**
 * Parse all well-formed regions in a document. Regions are returned in
 * document order.
 * @param content - The full file content.
 * @returns The parsed regions.
 * @throws {MarkerError} If a start has no matching end, an end has no
 *   matching start, or the names on a pair of markers disagree.
 */
export function parseRegions(content: string): Region[] {
  const lines = content.split(/\r?\n/);
  const regions: Region[] = [];
  const stack: { name: string; startLine: number; startIdx: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const startMatch = line.match(START_LINE_RE);
    if (startMatch) {
      const name = startMatch[1] ?? '';
      stack.push({ name, startLine: i + 1, startIdx: i });
      continue;
    }
    const endMatch = line.match(END_LINE_RE);
    if (endMatch) {
      const closingName = endMatch[1] ?? '';
      const open = stack.pop();
      if (!open) {
        throw new MarkerError(`unmatched jho:end:${closingName} at line ${i + 1}`);
      }
      if (open.name !== closingName) {
        throw new MarkerError(
          `region name mismatch: start '${open.name}' (line ${open.startLine}) ` +
            `vs end '${closingName}' (line ${i + 1})`,
        );
      }
      const contentLines = lines.slice(open.startIdx + 1, i);
      regions.push({
        name: open.name,
        startLine: open.startLine,
        endLine: i + 1,
        content: contentLines.join('\n'),
      });
    }
  }

  if (stack.length > 0) {
    const unclosed = stack.map((s) => `${s.name} (line ${s.startLine})`).join(', ');
    throw new MarkerError(`unclosed jho:start markers: ${unclosed}`);
  }

  return regions;
}

/**
 * Find a single region by name.
 * @param content - The full file content.
 * @param name - The region name to look for.
 * @returns The matching region, or `null` if absent.
 */
export function findRegion(content: string, name: string): Region | null {
  return parseRegions(content).find((r) => r.name === name) ?? null;
}

/**
 * Replace the content inside a named region while preserving everything
 * before and after. If the region is absent and `createIfMissing` is
 * set, a new region is appended. Otherwise a `MarkerError` is thrown.
 *
 * A trailing newline on `newContent` is consumed so the closing marker
 * lines up with the start marker.
 * @param content - The full file content.
 * @param name - The region name to replace.
 * @param newContent - The new body of the region. May be empty.
 * @param options - Behaviour when the region is absent.
 * @returns The rewritten file content.
 * @throws {MarkerError} If the region is missing and `createIfMissing`
 *   is not set, or if the region has a start with no matching end.
 */
export function replaceRegion(
  content: string,
  name: string,
  newContent: string,
  options: ReplaceRegionOptions = {},
): string {
  const lines = content.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => START_LINE_RE.test(l) && l.includes(`:${name} -->`));
  if (startIdx === -1) {
    if (options.createIfMissing) {
      const trimmed = content.replace(/\s*$/, '');
      const block = `${trimmed}\n\n<!-- jho:start:${name} -->\n${newContent}\n<!-- jho:end:${name} -->\n`;
      return block;
    }
    throw new MarkerError(`region not found: ${name}`);
  }
  const endIdx = lines.findIndex(
    (l, idx) => idx > startIdx && END_LINE_RE.test(l) && l.includes(`:${name} -->`),
  );
  if (endIdx === -1) {
    throw new MarkerError(`region '${name}' has start but no end marker`);
  }
  const newLines = newContent === '' ? [] : newContent.split(/\r?\n/);
  if (newContent.endsWith('\n') && newLines[newLines.length - 1] === '') {
    newLines.pop();
  }
  const out = [...lines.slice(0, startIdx + 1), ...newLines, ...lines.slice(endIdx)];
  return out.join('\n');
}

/**
 * Find a single-line "section" marker by name. Section markers are
 * informational (e.g. `<!-- jho:meta — frontmatter is tool-managed -->`)
 * and do not delimit a region. Used by `jho ownership` to label files.
 * @param content - The full file content.
 * @param name - The section name to look for.
 * @returns The matched line and its 1-based line number, or `null`.
 */
export function findSectionMarker(
  content: string,
  name: string,
): { line: number; text: string } | null {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const match = line.match(SECTION_LINE_RE);
    if (match && match[1] === name) {
      return { line: i + 1, text: line };
    }
  }
  return null;
}

/**
 * Extract the steer instruction from a file's content. Looks for a
 * `<!-- jho:steer: ... -->` marker line and returns the text.
 * @param content - The full file content.
 * @returns The steer text, or an empty string if no steer marker is found.
 */
export function extractSteer(content: string): string {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(STEER_LINE_RE);
    if (match) {
      return match[1] ?? '';
    }
  }
  return '';
}

/**
 * Replace or insert a steer marker in a file's content. If a steer
 * marker already exists, it is replaced. If not, the marker is inserted
 * after the first `jho:end:...` marker found, or at the end of the
 * file if no region markers exist.
 *
 * When `steer` is empty, the existing steer marker is removed.
 *
 * @param content - The full file content.
 * @param steer - The new steer text. Empty string removes the marker.
 * @returns The rewritten file content.
 */
export function replaceSteer(content: string, steer: string): string {
  const lines = content.split(/\r?\n/);

  // Find existing steer line
  const steerIdx = lines.findIndex((l) => STEER_LINE_RE.test(l));

  if (steer === '') {
    // Remove existing steer marker
    if (steerIdx !== -1) {
      lines.splice(steerIdx, 1);
    }
    return lines.join('\n');
  }

  const newSteerLine = `<!-- jho:steer: ${steer} -->`;

  if (steerIdx !== -1) {
    // Replace existing steer marker
    lines[steerIdx] = newSteerLine;
    return lines.join('\n');
  }

  // Insert after the first jho:end:... marker
  const endIdx = lines.findIndex((l) => END_LINE_RE.test(l));
  if (endIdx !== -1) {
    lines.splice(endIdx + 1, 0, newSteerLine);
    return lines.join('\n');
  }

  // No region markers — append at the end
  const trimmed = content.replace(/\s*$/, '');
  return `${trimmed}\n${newSteerLine}\n`;
}
