import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SlugOptions, SlugBuildInput } from './types.js';

// Slug convention (from PLAN §4): {YYYY}-{MMM}-{DD}-{roleAbbr}-{companySlug}[-{jobId}][-{n}]
// Example: 2026-Jun-03-SE-Nuage-Technology-Group-92448554-1
//
// Components:
//   YYYY-MMM-DD  : appliedOn (default: today)
//   roleAbbr     : first 2-3 words of title, sanitized to lowercase + hyphens, <= 24 chars total
//   companySlug  : company name, lowercased + hyphens + alphanumeric
//   jobId        : optional, extracted from the URL (Seek trailing numeric, LinkedIn /view/<id>, Indeed jk=)
//   -N           : optional, integer suffix on collision; counter persisted in .counters.json

export const SLUG_PATTERN = /^\d{4}-[A-Z][a-z]{2}-\d{2}-.+$/;

const MONTH_ABBR: readonly string[] = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const JOB_ID_PATTERNS: readonly { name: string; pattern: RegExp; group: number }[] = [
  { name: 'linkedin', pattern: /linkedin\.com\/jobs\/view\/(\d+)/, group: 1 },
  { name: 'indeed-jk', pattern: /[?&]jk=([A-Za-z0-9_-]+)/, group: 1 },
  { name: 'seek-trailing', pattern: /\/job(?:s)?\/(\d+)(?:[/?#]|$)/, group: 1 },
  { name: 'generic-trailing', pattern: /\/(\d{5,})(?:[/?#]|$)/, group: 1 },
];

function sanitizeUnbounded(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sanitizeToken(input: string, maxLen: number): string {
  const cleaned = sanitizeUnbounded(input);
  if (cleaned.length <= maxLen) {
    return cleaned;
  }
  return cleaned.slice(0, maxLen).replace(/-+$/, '');
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = MONTH_ABBR[d.getUTCMonth()];
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseAppliedOn(input: string | Date | undefined): Date {
  if (input === undefined) {
    return new Date();
  }
  if (input instanceof Date) {
    return input;
  }
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`invalid appliedOn date: ${input}`);
  }
  return d;
}

export function roleAbbr(title: string, maxWords = 3, maxLen = 24): string {
  const words = title
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  // Try the most words first; fall back to fewer if the result would be truncated.
  // We only return a truncated form if no N-word prefix fits within maxLen.
  for (let n = Math.min(maxWords, words.length); n >= 1; n--) {
    const joined = words.slice(0, n).join(' ');
    const full = sanitizeUnbounded(joined);
    if (full.length > 0 && full.length <= maxLen) {
      return full;
    }
  }
  // Final fallback: truncate the first word. Better an ugly suffix than nothing.
  if (words.length > 0) {
    const first = sanitizeUnbounded(words[0] ?? '');
    if (first.length > 0) {
      return first.slice(0, maxLen).replace(/-+$/, '');
    }
  }
  return '';
}

export function companySlug(company: string, maxLen = 32): string {
  const sanitized = sanitizeToken(company, maxLen);
  return sanitized.length > 0 ? sanitized : 'unknown';
}

export function extractJobIdFromUrl(url: string): string | null {
  for (const { pattern, group } of JOB_ID_PATTERNS) {
    const m = url.match(pattern);
    if (m && m[group] !== undefined) {
      return m[group];
    }
  }
  return null;
}

export function buildSlug(input: SlugBuildInput, _options: SlugOptions = {}): string {
  const date = parseAppliedOn(input.appliedOn);
  const datePart = formatDate(date);
  const role = roleAbbr(input.title ?? 'unknown');
  const company = companySlug(input.company ?? 'unknown');
  const jobId = input.url !== undefined ? extractJobIdFromUrl(input.url) : null;

  const base = `${datePart}-${role}-${company}`;
  if (jobId !== null) {
    return `${base}-${jobId}`;
  }
  return base;
}

export function validateSlug(slug: string): { ok: true } | { ok: false; reason: string } {
  if (!SLUG_PATTERN.test(slug)) {
    return { ok: false, reason: 'does not match YYYY-MMM-DD-* pattern' };
  }
  const datePart = slug.slice(0, 11);
  const [yyyy, mmm, dd] = datePart.split('-');
  const year = Number(yyyy);
  const monthIdx = MONTH_ABBR.indexOf(mmm ?? '');
  const day = Number(dd);
  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    return { ok: false, reason: `invalid year: ${yyyy}` };
  }
  if (monthIdx < 0) {
    return { ok: false, reason: `invalid month abbreviation: ${mmm}` };
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return { ok: false, reason: `invalid day: ${dd}` };
  }
  return { ok: true };
}

interface Counters {
  [baseSlug: string]: number;
}

export function readCounters(appliedDir: string): Counters {
  const path = resolve(appliedDir, '.counters.json');
  if (!existsSync(path)) {
    return {};
  }
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: Counters = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

// Returns 0 if no collision, or the next integer suffix.
// Updates the in-memory counter; the caller is expected to write the file back.
export function nextCollisionSuffix(baseSlug: string, appliedDir: string): number {
  const counters = readCounters(appliedDir);
  return counters[baseSlug] ?? 0;
}
