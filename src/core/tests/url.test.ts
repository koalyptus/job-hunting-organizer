import { describe, expect, it } from 'vitest';
import { extractJobIdFromUrl } from '../url.js';

describe('extractJobIdFromUrl', () => {
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

  it('returns null for malformed URLs', () => {
    expect(extractJobIdFromUrl('not a url')).toBeNull();
  });
});
