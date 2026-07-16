import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  buildSlug,
  companySlug,
  roleAbbr,
  extractDateFromSlug,
  SLUG_PATTERN,
  uniqueSlug,
} from '../../parser/slug.js';
import { validateSlug } from '../../validate.js';

vi.mock('../../logger/logger.js', () => ({
  getRootLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('SLUG_PATTERN', () => {
  it('matches well-formed slugs', () => {
    expect(SLUG_PATTERN.test('2026-Jun-03-SE-Nuage-92448554')).toBe(true);
    expect(SLUG_PATTERN.test('2026-Jan-15-senior-engineer-foo-123')).toBe(true);
  });

  it('rejects slugs without proper date prefix', () => {
    expect(SLUG_PATTERN.test('jun-03-SE-Nuage')).toBe(false);
    expect(SLUG_PATTERN.test('2026-13-01-SE-Nuage')).toBe(false);
    expect(SLUG_PATTERN.test('2026-jun-03-SE-Nuage')).toBe(false);
  });

  it('rejects empty or short strings', () => {
    expect(SLUG_PATTERN.test('')).toBe(false);
    expect(SLUG_PATTERN.test('2026')).toBe(false);
  });
});

describe('extractDateFromSlug', () => {
  it('extracts date from a valid slug', () => {
    expect(extractDateFromSlug('2026-Jun-03-SE-Nuage-92448554')).toBe('20260603');
  });

  it('extracts date with different months', () => {
    expect(extractDateFromSlug('2026-Jan-15-SE-Foo')).toBe('20260115');
    expect(extractDateFromSlug('2026-Dec-25-SE-Bar')).toBe('20261225');
  });

  it('returns empty string for invalid slug format', () => {
    expect(extractDateFromSlug('not-a-slug')).toBe('');
  });

  it('returns empty string for invalid month abbreviation', () => {
    expect(extractDateFromSlug('2026-Foo-03-SE')).toBe('');
  });
});

describe('roleAbbr', () => {
  it('takes the first 2-3 words, lowercased and sanitized', () => {
    expect(roleAbbr('Senior Software Engineer')).toBe('senior-software-engineer');
  });

  it('handles a single-word title', () => {
    expect(roleAbbr('Engineer')).toBe('engineer');
  });

  it('replaces punctuation and special chars with hyphens', () => {
    expect(roleAbbr('C++ Developer')).toBe('c-developer');
  });

  it('collapses multiple separators', () => {
    expect(roleAbbr('Sr.  Backend/Platform Engineer')).toBe('sr-backend-platform');
  });

  it('respects the max length', () => {
    const slug = roleAbbr('Principal Distinguished Staff Software Engineer', 3, 18);
    expect(slug.length).toBeLessThanOrEqual(18);
  });

  it('treats & as "and"', () => {
    expect(roleAbbr('Research & Development Lead')).toBe('research-and-development');
  });

  it('returns empty string for empty input', () => {
    expect(roleAbbr('')).toBe('');
  });

  it('truncates and strips trailing hyphens for very long single word', () => {
    const result = roleAbbr('Supercalifragilisticexpialidocious', 1, 10);
    expect(result.length).toBeLessThanOrEqual(10);
    expect(result).not.toMatch(/-$/);
  });
});

describe('companySlug', () => {
  it('lowercases and sanitizes the company name', () => {
    expect(companySlug('Nuage Technology Group')).toBe('nuage-technology-group');
  });

  it('strips trailing punctuation', () => {
    expect(companySlug('Foo, Inc.')).toBe('foo-inc');
  });

  it('returns "unknown" for empty input', () => {
    expect(companySlug('')).toBe('unknown');
    expect(companySlug('!!!')).toBe('unknown');
  });
});

describe('buildSlug', () => {
  it('builds a base slug from title, company, and date', () => {
    const slug = buildSlug({
      title: 'Senior Software Engineer',
      company: 'Nuage Technology Group',
      appliedOn: '2026-06-03T00:00:00Z',
    });
    expect(slug).toBe('2026-Jun-03-senior-software-engineer-nuage-technology-group');
  });

  it('appends a job ID when the URL has one', () => {
    const slug = buildSlug({
      title: 'Software Engineer',
      company: 'Nuage',
      url: 'https://au.seek.com.au/job/92448554',
      appliedOn: '2026-06-03T00:00:00Z',
    });
    expect(slug).toBe('2026-Jun-03-software-engineer-nuage-92448554');
  });

  it('uses today (UTC) when appliedOn is omitted', () => {
    const slug = buildSlug({ title: 'Engineer', company: 'Foo' });
    expect(slug).toMatch(/^\d{4}-[A-Z][a-z]{2}-\d{2}-engineer-foo$/);
  });

  it('falls back to "unknown" for missing title/company', () => {
    const slug = buildSlug({ appliedOn: '2026-06-03T00:00:00Z' });
    expect(slug).toBe('2026-Jun-03-unknown-unknown');
  });
});

describe('uniqueSlug', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'jho-slug-unique-'));
    mkdirSync(join(testDir, 'applied'), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('returns base slug when no collision exists', async () => {
    const result = await uniqueSlug(
      { title: 'Engineer', company: 'Foo', appliedOn: '2026-06-03T00:00:00Z' },
      join(testDir, 'applied'),
    );
    expect(result).toBe('2026-Jun-03-engineer-foo');
  });

  it('appends -1 when folder already exists', async () => {
    const appliedDir = join(testDir, 'applied');
    const baseSlug = '2026-Jun-03-engineer-foo';
    mkdirSync(join(appliedDir, baseSlug), { recursive: true });

    const result = await uniqueSlug(
      { title: 'Engineer', company: 'foo', appliedOn: '2026-06-03T00:00:00Z' },
      appliedDir,
    );
    expect(result).toBe(`${baseSlug}-1`);
  });

  it('increments counter on subsequent collisions', async () => {
    const appliedDir = join(testDir, 'applied');
    const baseSlug = '2026-Jun-03-engineer-foo';

    const result1 = await uniqueSlug(
      { title: 'Engineer', company: 'foo', appliedOn: '2026-06-03T00:00:00Z' },
      appliedDir,
    );
    expect(result1).toBe(baseSlug);

    mkdirSync(join(appliedDir, baseSlug), { recursive: true });

    const result2 = await uniqueSlug(
      { title: 'Engineer', company: 'foo', appliedOn: '2026-06-03T00:00:00Z' },
      appliedDir,
    );
    expect(result2).toBe(`${baseSlug}-1`);

    const result3 = await uniqueSlug(
      { title: 'Engineer', company: 'foo', appliedOn: '2026-06-03T00:00:00Z' },
      appliedDir,
    );
    expect(result3).toBe(`${baseSlug}-2`);
  });
});

describe('validateSlug', () => {
  it('accepts canonical slugs', () => {
    expect(validateSlug('2026-Jun-03-SE-Nuage-Technology-Group-92448554')).toEqual({ ok: true });
    expect(validateSlug('2026-Jan-15-SE-Foo-123')).toEqual({ ok: true });
  });

  it('rejects malformed slugs', () => {
    const r = validateSlug('2026-jun-03-...');
    expect(r.ok).toBe(false);
  });

  it('rejects invalid month abbreviations', () => {
    expect(validateSlug('2026-Foo-03-bar').ok).toBe(false);
  });

  it('rejects out-of-range day', () => {
    expect(validateSlug('2026-Jun-99-bar').ok).toBe(false);
  });

  it('rejects out-of-range year', () => {
    expect(validateSlug('0001-Jun-03-bar').ok).toBe(false);
  });
});
