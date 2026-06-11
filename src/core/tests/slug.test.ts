import { describe, expect, it } from 'vitest';
import { buildSlug, companySlug, roleAbbr } from '../slug.js';
import { validateSlug } from '../validate.js';

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
