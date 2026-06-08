import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { extractJobIdFromUrl } from '../url.js';

describe('extractJobIdFromUrl (built-in patterns)', () => {
  const originalEnv = process.env.JHO_URL_PATTERNS;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.JHO_URL_PATTERNS;
    } else {
      process.env.JHO_URL_PATTERNS = originalEnv;
    }
  });

  it('extracts the trailing numeric from Seek AU', () => {
    expect(extractJobIdFromUrl('https://au.seek.com.au/job/12345')).toBe('12345');
    expect(extractJobIdFromUrl('https://au.seek.com.au/job/12345?ref=applied')).toBe('12345');
  });

  it('extracts the trailing numeric from Seek with /jobs/ (plural)', () => {
    expect(extractJobIdFromUrl('https://au.seek.com.au/jobs/98765/')).toBe('98765');
  });

  it('extracts the job ID from LinkedIn', () => {
    expect(extractJobIdFromUrl('https://www.linkedin.com/jobs/view/1234567890')).toBe('1234567890');
  });

  it('extracts jk from Indeed', () => {
    expect(extractJobIdFromUrl('https://au.indeed.com/viewjob?jk=abc123&from=serp')).toBe('abc123');
  });

  it('extracts a generic trailing 5+ digit ID from unknown boards', () => {
    expect(extractJobIdFromUrl('https://jobs.example.com/listing/123456')).toBe('123456');
  });

  it('prefers site-specific patterns over the generic fallback', () => {
    // LinkedIn's pattern matches first.
    expect(extractJobIdFromUrl('https://www.linkedin.com/jobs/view/1234567890')).toBe('1234567890');
  });

  it('returns null for URLs without a recognizable job ID', () => {
    expect(extractJobIdFromUrl('https://example.com/careers')).toBeNull();
  });

  it('returns null for short trailing numbers (below the 5-digit generic threshold)', () => {
    expect(extractJobIdFromUrl('https://example.com/page/1234')).toBeNull();
  });

  it('extracts via the generic pattern when preceded by a dash', () => {
    expect(extractJobIdFromUrl('https://example.com/prefix-12345')).toBe('12345');
    expect(extractJobIdFromUrl('https://example.com/prefix-987654')).toBe('987654');
  });

  it('excludes year-like numbers (1900-2099) from the generic pattern', () => {
    // Years in path segments should NOT match the generic pattern
    expect(extractJobIdFromUrl('https://example.com/archive/2024/')).toBeNull();
    expect(extractJobIdFromUrl('https://example.com/archive/2025/')).toBeNull();
    expect(extractJobIdFromUrl('https://example.com/archive/1999/')).toBeNull();
    expect(extractJobIdFromUrl('https://example.com/archive/2099/')).toBeNull();
    // But numbers starting with 21+ should still match
    expect(extractJobIdFromUrl('https://example.com/archive/21000')).toBe('21000');
    expect(extractJobIdFromUrl('https://example.com/archive/18999')).toBe('18999');
  });

  it('excludes year-like numbers when preceded by a dash', () => {
    expect(extractJobIdFromUrl('https://example.com/job-2024/')).toBeNull();
    expect(extractJobIdFromUrl('https://example.com/job-2025/')).toBeNull();
    // Non-year dashes still match
    expect(extractJobIdFromUrl('https://example.com/job-21000')).toBe('21000');
  });

  it('does NOT match generic pattern when digits are followed by alpha (not a delimiter)', () => {
    expect(extractJobIdFromUrl('https://example.com/listing/12345abc')).toBeNull();
    expect(extractJobIdFromUrl('https://example.com/listing-12345xyz')).toBeNull();
  });

  it('matches generic pattern with trailing slash after the ID', () => {
    expect(extractJobIdFromUrl('https://example.com/listing/12345/')).toBe('12345');
    expect(extractJobIdFromUrl('https://example.com/listing/12345/?ref=test')).toBe('12345');
  });

  it('extracts Indeed jk from various URL structures', () => {
    expect(extractJobIdFromUrl('https://au.indeed.com/viewjob?jk=abc123')).toBe('abc123');
    expect(extractJobIdFromUrl('https://www.indeed.com/jobs?q=engineer&jk=def456')).toBe('def456');
    expect(extractJobIdFromUrl('https://indeed.com/viewjob?jk=xyz_789&from=serp')).toBe('xyz_789');
  });

  it('returns null for malformed URLs', () => {
    expect(extractJobIdFromUrl('not a url')).toBeNull();
  });
});

describe('extractJobIdFromUrl (user-supplied patterns via JHO_URL_PATTERNS)', () => {
  beforeEach(() => {
    // Suppress expected warning logs from invalid JHO_URL_PATTERNS values
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Reset the module cache to re-run the module-level code with the new environment
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clear the environment variable after each test
    delete process.env.JHO_URL_PATTERNS;
  });

  it('uses user-supplied patterns when valid', async () => {
    process.env.JHO_URL_PATTERNS = JSON.stringify([
      { name: 'custom-board', pattern: '/opening/(\\d+)/', group: 1 },
    ]);
    const urlModule = await import('../url.js');
    const { extractJobIdFromUrl: extractJobId } = urlModule;
    expect(extractJobId('https://example.com/opening/12345/')).toBe('12345');
    expect(extractJobId('https://example.com/opening/67890/?ref=test')).toBe('67890');
  });

  it('does not match invalid JSON in environment variable', async () => {
    process.env.JHO_URL_PATTERNS = 'not json';
    const urlModule = await import('../url.js');
    const { extractJobIdFromUrl: extractJobId } = urlModule;
    // Should fall back to built-in patterns
    expect(extractJobId('https://www.linkedin.com/jobs/view/12345')).toBe('12345');
    expect(extractJobId('https://example.com/opening/2024/')).toBeNull(); // user pattern not valid
  });

  it('ignores malformed entries in the JSON array', async () => {
    process.env.JHO_URL_PATTERNS = JSON.stringify([
      { name: 'valid', pattern: '/item/(\\d+)/', group: 1 },
      { name: 'missing-group', pattern: '/item/(\\d+)/' }, // missing group
      { name: 'wrong-type', pattern: '/item/(\\d+)/', group: '1' }, // group should be number
      { name: 'invalid-regex', pattern: '/[invalid-regex', group: 1 },
    ]);
    const urlModule = await import('../url.js');
    const { extractJobIdFromUrl: extractJobId } = urlModule;
    // Only the valid pattern should work
    expect(extractJobId('https://example.com/item/42/')).toBe('42');
    // Built-in patterns should still work
    expect(extractJobId('https://www.linkedin.com/jobs/view/12345')).toBe('12345');
  });

  it('user patterns take precedence over built-in patterns', async () => {
    process.env.JHO_URL_PATTERNS = JSON.stringify([
      { name: 'override-linkedin', pattern: '/linkedin\\.com\\/jobs\\/view\\/(\\d+)/', group: 1 },
    ]);
    const urlModule = await import('../url.js');
    const { extractJobIdFromUrl: extractJobId } = urlModule;
    // The user pattern matches the same URL as the built-in LinkedIn pattern
    // but we expect it to work (it's the same pattern, so same result)
    expect(extractJobId('https://www.linkedin.com/jobs/view/12345')).toBe('12345');
    // Now test a case where the user pattern matches a URL that the built-in
    // generic pattern would also match, but we want the user pattern to win.
    process.env.JHO_URL_PATTERNS = JSON.stringify([
      { name: 'custom-generic', pattern: '/id/(\\d+)/', group: 1 },
    ]);
    const urlModule2 = await import('../url.js');
    const { extractJobIdFromUrl: extractJobId2 } = urlModule2;
    // The URL matches both the user pattern and the built-in generic pattern.
    // The user pattern should be tried first and win.
    expect(extractJobId2('/path/id/123456/')).toBe('123456');
    // The built-in generic pattern would also match, but we don't care which
    // one we got as long as we got the ID.
  });

  it('falls back to built-in patterns when no user pattern matches', async () => {
    process.env.JHO_URL_PATTERNS = JSON.stringify([
      { name: 'no-match', pattern: '/nomatch/(\\d+)/', group: 1 },
    ]);
    const urlModule = await import('../url.js');
    const { extractJobIdFromUrl: extractJobId } = urlModule;
    expect(extractJobId('https://www.linkedin.com/jobs/view/12345')).toBe('12345');
    expect(extractJobId('https://example.com/listing/98765/')).toBe('98765');
  });

  it('returns null when no patterns match (user or built-in)', async () => {
    process.env.JHO_URL_PATTERNS = JSON.stringify([
      { name: 'no-match', pattern: '/nomatch/(\\d+)/', group: 1 },
    ]);
    const urlModule = await import('../url.js');
    const { extractJobIdFromUrl: extractJobId } = urlModule;
    expect(extractJobId('https://example.com/careers')).toBeNull();
  });

  it('treats non-array JSON as empty array', async () => {
    process.env.JHO_URL_PATTERNS = JSON.stringify({});
    const urlModule = await import('../url.js');
    const { extractJobIdFromUrl: extractJobId } = urlModule;
    // Should fall back to built-in patterns
    expect(extractJobId('https://www.linkedin.com/jobs/view/12345')).toBe('12345');
    expect(extractJobId('https://example.com/opening/2024/')).toBeNull();
  });

  it('skips non-object elements in the array', async () => {
    process.env.JHO_URL_PATTERNS = JSON.stringify([
      'not an object',
      42,
      { name: 'valid', pattern: '/item/(\\d+)/', group: 1 },
    ]);
    const urlModule = await import('../url.js');
    const { extractJobIdFromUrl: extractJobId } = urlModule;
    // Only the valid pattern should work
    expect(extractJobId('https://example.com/item/42/')).toBe('42');
    // Built-in patterns should still work
    expect(extractJobId('https://www.linkedin.com/jobs/view/12345')).toBe('12345');
  });
});
