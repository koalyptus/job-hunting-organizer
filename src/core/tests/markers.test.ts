import { describe, expect, it } from 'vitest';
import {
  REGION_MARKER_NAMES,
  MarkerError,
  findRegion,
  findSectionMarker,
  isKnownRegionName,
  parseRegions,
  replaceRegion,
} from '../markers.js';

describe('isKnownRegionName', () => {
  it('accepts known region names', () => {
    expect(isKnownRegionName('fetched-jd')).toBe(true);
    expect(isKnownRegionName('tool-output')).toBe(true);
    expect(isKnownRegionName('cover-letter')).toBe(true);
  });

  it('rejects unknown region names', () => {
    expect(isKnownRegionName('not-a-region')).toBe(false);
    expect(isKnownRegionName('')).toBe(false);
  });

  it('rejects names that are too close to escape the namespace', () => {
    expect(isKnownRegionName('fetched-jd-2')).toBe(false);
    expect(isKnownRegionName('FETCHED-JD')).toBe(false);
  });

  it('exports the full list as a frozen-ish tuple', () => {
    expect(REGION_MARKER_NAMES).toContain('fetched-jd');
  });

  it('keeps the RegionName literal union in sync with REGION_MARKER_NAMES', () => {
    // The RegionName type in types.ts is a hardcoded literal union
    // (not derived) to avoid a circular import. This test catches
    // drift between the two — if you add a name to one, add it to
    // the other, and update both this assertion and the union.
    const fromArray: readonly string[] = REGION_MARKER_NAMES;
    const fromLiteral: readonly string[] = ['fetched-jd', 'tool-output', 'cover-letter'];
    expect(fromArray).toEqual(fromLiteral);
  });
});

describe('parseRegions', () => {
  it('parses a single region', () => {
    const content = [
      '# My notes',
      '',
      '<!-- jho:start:fetched-jd -->',
      'We are looking for a senior engineer...',
      '<!-- jho:end:fetched-jd -->',
      '',
      'my own analysis',
    ].join('\n');
    const regions = parseRegions(content);
    expect(regions).toHaveLength(1);
    expect(regions[0]?.name).toBe('fetched-jd');
    expect(regions[0]?.content).toBe('We are looking for a senior engineer...');
    expect(regions[0]?.startLine).toBe(3);
    expect(regions[0]?.endLine).toBe(5);
  });

  it('parses multiple regions', () => {
    const content = [
      '<!-- jho:start:fetched-jd -->',
      'jd body',
      '<!-- jho:end:fetched-jd -->',
      'middle text',
      '<!-- jho:start:tool-output -->',
      'tool body',
      '<!-- jho:end:tool-output -->',
    ].join('\n');
    const regions = parseRegions(content);
    expect(regions.map((r) => r.name)).toEqual(['fetched-jd', 'tool-output']);
    expect(regions[0]?.content).toBe('jd body');
    expect(regions[1]?.content).toBe('tool body');
  });

  it('returns [] when there are no markers', () => {
    expect(parseRegions('just text\nno markers')).toEqual([]);
  });

  it('throws on a start without a matching end', () => {
    const content = '<!-- jho:start:fetched-jd -->\nbroken\n';
    expect(() => parseRegions(content)).toThrow(MarkerError);
    expect(() => parseRegions(content)).toThrow(/unclosed jho:start markers/);
  });

  it('throws on an end without a matching start', () => {
    const content = 'oops\n<!-- jho:end:fetched-jd -->\n';
    expect(() => parseRegions(content)).toThrow(MarkerError);
    expect(() => parseRegions(content)).toThrow(/unmatched jho:end/);
  });

  it('throws on a mismatched start/end name', () => {
    const content = '<!-- jho:start:fetched-jd -->\nbody\n<!-- jho:end:tool-output -->\n';
    expect(() => parseRegions(content)).toThrow(MarkerError);
    expect(() => parseRegions(content)).toThrow(/region name mismatch/);
  });

  it('handles CRLF line endings', () => {
    const content = '<!-- jho:start:fetched-jd -->\r\njd body\r\n<!-- jho:end:fetched-jd -->\r\n';
    const regions = parseRegions(content);
    expect(regions).toHaveLength(1);
    expect(regions[0]?.content).toBe('jd body');
  });

  it('ignores section markers (single-line comments)', () => {
    const content = [
      '<!-- jho:meta — frontmatter is tool-managed; body is yours. -->',
      '',
      'user content',
    ].join('\n');
    expect(parseRegions(content)).toEqual([]);
  });
});

describe('findRegion', () => {
  it('returns the region if present', () => {
    const content = '<!-- jho:start:fetched-jd -->\nbody\n<!-- jho:end:fetched-jd -->\n';
    const r = findRegion(content, 'fetched-jd');
    expect(r).not.toBeNull();
    expect(r?.content).toBe('body');
  });

  it('returns null if not present', () => {
    expect(findRegion('no markers here', 'fetched-jd')).toBeNull();
  });
});

describe('replaceRegion', () => {
  it('replaces the content inside the region, preserving surroundings', () => {
    const content = [
      '<!-- jho:start:fetched-jd -->',
      'old jd',
      '<!-- jho:end:fetched-jd -->',
      '',
      'user notes',
    ].join('\n');
    const updated = replaceRegion(content, 'fetched-jd', 'new jd\nwith details');
    expect(updated).toBe(
      [
        '<!-- jho:start:fetched-jd -->',
        'new jd',
        'with details',
        '<!-- jho:end:fetched-jd -->',
        '',
        'user notes',
      ].join('\n'),
    );
  });

  it('strips a trailing newline from the new content', () => {
    const content = '<!-- jho:start:fetched-jd -->\nold\n<!-- jho:end:fetched-jd -->\n';
    const updated = replaceRegion(content, 'fetched-jd', 'new content\n');
    expect(updated).toBe(
      '<!-- jho:start:fetched-jd -->\nnew content\n<!-- jho:end:fetched-jd -->\n',
    );
  });

  it('handles multi-line new content with blank lines', () => {
    const content = '<!-- jho:start:fetched-jd -->\nold\n<!-- jho:end:fetched-jd -->\n';
    const newContent = 'line 1\n\nline 3';
    const updated = replaceRegion(content, 'fetched-jd', newContent);
    expect(updated).toBe(
      '<!-- jho:start:fetched-jd -->\nline 1\n\nline 3\n<!-- jho:end:fetched-jd -->\n',
    );
  });

  it('throws when the region does not exist and createIfMissing is false', () => {
    expect(() => replaceRegion('no markers', 'fetched-jd', 'body')).toThrow(MarkerError);
  });

  it('appends a new region when createIfMissing is true', () => {
    const content = '# Top of file\n\nsome text\n';
    const updated = replaceRegion(content, 'fetched-jd', 'new body', { createIfMissing: true });
    expect(updated).toContain('<!-- jho:start:fetched-jd -->');
    expect(updated).toContain('new body');
    expect(updated).toContain('<!-- jho:end:fetched-jd -->');
    // Original content is preserved.
    expect(updated).toContain('# Top of file');
    expect(updated).toContain('some text');
  });

  it('throws when the region has start but no end', () => {
    const content = '<!-- jho:start:fetched-jd -->\nbody without end\n';
    expect(() => replaceRegion(content, 'fetched-jd', 'x')).toThrow(MarkerError);
  });
});

describe('findSectionMarker', () => {
  it('finds a single-line section marker by name', () => {
    const content = [
      '<!-- jho:meta — frontmatter is tool-managed; body is yours. -->',
      'some body',
    ].join('\n');
    const m = findSectionMarker(content, 'meta');
    expect(m).not.toBeNull();
    expect(m?.line).toBe(1);
    expect(m?.text).toContain('jho:meta');
  });

  it('returns null when the marker is not present', () => {
    expect(findSectionMarker('no markers', 'meta')).toBeNull();
  });

  it('does not confuse a section marker with a region start', () => {
    const content = '<!-- jho:start:fetched-jd -->\n';
    expect(findSectionMarker(content, 'fetched-jd')).toBeNull();
  });
});
