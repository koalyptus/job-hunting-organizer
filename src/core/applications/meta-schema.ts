import { z } from 'zod';
import { toIsoDate, todayIso } from '../date.js';

/**
 * Zod schema for the `meta.md` frontmatter in each application folder.
 * Validates and defaults the YAML frontmatter that the tool manages.
 * User fields below the frontmatter are untouched (see PLAN §4).
 *
 * @see {@link ApplicationFrontmatter} for the TypeScript interface (inferred from this schema).
 */

/** Valid employment types. */
export const EmploymentTypeSchema = z.enum([
  'permanent',
  'temp',
  'contract',
  'casual',
  'part-time',
  '',
]);

/** Inferred TypeScript type from {@link EmploymentTypeSchema}. */
export type EmploymentType = z.infer<typeof EmploymentTypeSchema>;

/** Valid application lifecycle statuses. */
export const ApplicationStatusSchema = z.enum([
  'applied',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
  'abandoned',
  'ghosted',
  'accepted',
]);

/**
 * Zod schema for `meta.md` frontmatter. Every field has a `.default(...)`
 * so a missing or partial file still yields a known-good shape. Extra keys
 * survive the file round-trip (preserved by `mergeFrontmatter` before
 * `writeFrontmatter`) but are stripped from the Zod-validated type.
 */
export const ApplicationFrontmatterSchema = z.object({
  /** Application slug (matches the folder name). */
  slug: z.string(),
  /** Current lifecycle status. Default: `'applied'`. */
  status: ApplicationStatusSchema.default('applied'),
  /** Application date as ISO date string (e.g. `'2026-06-03'`). */
  appliedOn: z
    .string()
    .or(z.date().transform((d) => toIsoDate(d)))
    .default(() => todayIso()),
  /** Job title. */
  title: z.string().default(''),
  /** Company name. */
  company: z.string().default(''),
  /** Freeform location text. */
  location: z.string().default(''),
  /** Job board or source site (e.g. `'Seek'`, `'LinkedIn'`). */
  site: z.string().default(''),
  /** Original job posting URL. */
  link: z.string().default(''),
  /** Salary or pay range text. */
  salary: z.string().default(''),
  /** Classification tags (e.g. `['typescript', 'react', 'backend']`). */
  tags: z.array(z.string()).default([]),
  /** Slug of the best-matching target role from `profile.md` `## Target roles`. */
  targetRole: z.string().default(''),
  /** Employment type (e.g. `'permanent'`, `'contract'`, `'part-time'`). */
  employmentType: EmploymentTypeSchema.default(''),
});

/** Inferred TypeScript type from {@link ApplicationFrontmatterSchema}. */
type ApplicationFrontmatterParsed = z.infer<typeof ApplicationFrontmatterSchema>;

/**
 * Validate raw frontmatter against the schema. Extra keys are preserved
 * (not stripped) so user-defined fields survive the round-trip.
 * @param raw - The raw frontmatter object from `parseFrontmatter`.
 * @returns A fully-defaulted, validated `ApplicationFrontmatter` object.
 * @throws {z.ZodError} if the data violates the schema (e.g. invalid status).
 */
export function validateApplicationFrontmatter(
  raw: Record<string, unknown>,
): ApplicationFrontmatterParsed {
  return ApplicationFrontmatterSchema.parse(raw);
}

/**
 * Safely validate raw frontmatter without throwing. Returns the parsed
 * result or a list of Zod issues.
 * @param raw - The raw frontmatter object from `parseFrontmatter`.
 * @returns `{ success: true, data }` or `{ success: false, issues }`.
 */
export function safeValidateApplicationFrontmatter(
  raw: Record<string, unknown>,
):
  | { success: true; data: ApplicationFrontmatterParsed }
  | { success: false; issues: z.ZodIssue[] } {
  const result = ApplicationFrontmatterSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, issues: result.error.issues };
}
