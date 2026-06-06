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

export const REGION_MARKER_NAMES = ['fetched-jd', 'tool-output', 'cover-letter'] as const;

export type RegionName = (typeof REGION_MARKER_NAMES)[number];

const START_LINE_RE = /^<!-- jho:start:([a-z0-9-]+) -->\s*$/;
const END_LINE_RE = /^<!-- jho:end:([a-z0-9-]+) -->\s*$/;
const SECTION_LINE_RE = /^<!-- jho:([a-z0-9-]+) [^>]+-->\s*$/;

export interface Region {
  /** Region name (e.g., 'fetched-jd'). */
  name: string;
  /** 1-based line number of the start marker. */
  startLine: number;
  /** 1-based line number of the end marker. */
  endLine: number;
  /** The lines strictly between the two markers (no trailing newline). */
  content: string;
}

export class MarkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarkerError';
  }
}

export function isKnownRegionName(name: string): name is RegionName {
  return (REGION_MARKER_NAMES as readonly string[]).includes(name);
}

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

export function findRegion(content: string, name: string): Region | null {
  return parseRegions(content).find((r) => r.name === name) ?? null;
}

export interface ReplaceRegionOptions {
  /**
   * If true and the region does not exist, append a new region to the end
   * of the file. If false (default), throw a `MarkerError`.
   */
  createIfMissing?: boolean;
}

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
  // Find the matching END marker after this START.
  const endIdx = lines.findIndex(
    (l, idx) => idx > startIdx && END_LINE_RE.test(l) && l.includes(`:${name} -->`),
  );
  if (endIdx === -1) {
    throw new MarkerError(`region '${name}' has start but no end marker`);
  }
  const newLines = newContent === '' ? [] : newContent.split(/\r?\n/);
  // Drop the trailing empty line that came from `newContent.endsWith('\n')`.
  if (newContent.endsWith('\n') && newLines[newLines.length - 1] === '') {
    newLines.pop();
  }
  const out = [...lines.slice(0, startIdx + 1), ...newLines, ...lines.slice(endIdx)];
  return out.join('\n');
}

// Match single-line "section" markers like `<!-- jho:meta — ... -->`.
// These are informational only — used by `jho ownership` to label files.
export function findSectionMarker(
  content: string,
  name: string,
): { line: number; text: string } | null {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const m = line.match(SECTION_LINE_RE);
    if (m && m[1] === name) {
      return { line: i + 1, text: line };
    }
  }
  return null;
}
