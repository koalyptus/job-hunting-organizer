/**
 * Shared constants and helpers for LLM eval suites.
 * Imported by cover-letter, qa, prepare, learning-plan, etc.
 *
 * Keep this module thin — only cross-cutting test constants live here.
 * Module-specific expectations stay in each suite's cases.ts.
 */

// ─── Banned / modesty phrases (from cover-letter prompt) ─────────────────────

/** Phrases the LLM must never produce (modesty / AI-disclosure rule). */
export const BANNED_PHRASES: readonly string[] = [
  'world-class',
  'outstanding',
  'remarkable',
  'passionate about',
  'love building',
  'obsessed with',
  'excited to',
  'confident that',
];

// ─── Profile fixture items (from evals/fixtures/profile.md) ──────────────────

/** Strings from the profile fixture that generated content should reference. */
export const PROFILE_ITEMS: readonly string[] = [
  'PropTech Solutions',
  'React',
  'TypeScript',
  'Redux',
  'component library',
  'Vitest',
  'Digital Agency',
];

// ─── Resource URL check ─────────────────────────────────────────────────────

const URL_RE = /^https?:\/\//;
const KNOWN_SOURCES: readonly string[] = [
  'docs.python.org',
  'developer.mozilla.org',
  'github.com',
  'react.dev',
  'reactjs.org',
  'nextjs.org',
  'nodejs.org',
  'typescriptlang.org',
  'zod.dev',
  'vitest.dev',
  'playwright.dev',
  'testing-library.com',
  'kubernetes.io',
  'docs.docker.com',
  'aws.amazon.com',
  'cloud.google.com',
  'learn.microsoft.com',
  'openai.com',
  'anthropic.com',
  'redux-toolkit.js.org',
  'reactrouter.com',
  'tailwindcss.com',
  'stripe.com/docs',
  'postgresql.org/docs',
  'redis.io/docs',
];

/**
 * Returns true if a resource string looks like a real, non-fabricated
 * reference (valid URL, known source domain, or a plausible descriptive
 * reference like "react docs: optimizing performance").
 */
export function isRealResource(resource: string): boolean {
  const trimmed = resource.trim();
  if (!trimmed) {
    return false;
  }
  if (URL_RE.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }
  const lower = trimmed.toLowerCase();
  if (KNOWN_SOURCES.some((s) => lower.includes(s))) {
    return true;
  }
  // Plausible descriptive reference: reasonable length, contains letters,
  // not just gibberish. Accepts things like "react docs", "kent c. dodds blog",
  // "DDIA chapter 5", etc.
  return trimmed.length >= 5 && /[a-z]/i.test(trimmed) && !/^https?:\/\/\s*$/.test(trimmed);
}
