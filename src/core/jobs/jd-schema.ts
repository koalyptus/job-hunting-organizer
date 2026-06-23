import { z } from 'zod';

/**
 * Coerce a value that might be an object with a `.text` property
 * (e.g. `{text: "..."}`) into a plain string. Returns `undefined`
 * for nullish values. This handles common LLM output patterns where
 * structured objects are returned instead of plain strings.
 */
function coerceString(val: unknown): string | undefined {
  if (val == null) {
    return undefined;
  }
  if (typeof val === 'string') {
    return val;
  }
  if (
    typeof val === 'object' &&
    'text' in val &&
    typeof (val as { text: unknown }).text === 'string'
  ) {
    return (val as { text: string }).text;
  }
  return undefined;
}

/**
 * An array of strings that also accepts objects with a `.text` property
 * and filters out nullish entries. Handles LLM output like
 * `[{text: "requirement 1"}, "requirement 2"]`.
 */
const stringArray = z
  .array(z.union([z.string(), z.null(), z.record(z.string(), z.unknown())]))
  .optional()
  .transform((val) => {
    if (val === undefined) {
      return undefined;
    }
    return val
      .map((item) => coerceString(item))
      .filter((s): s is string => s !== undefined && s.length > 0);
  });

/**
 * A nullable-or-undefined string that returns `undefined` for `null`
 * or empty strings. Handles LLMs that output `null` instead of
 * omitting optional fields.
 */
const nullableString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((val) => (val == null || val === '' ? undefined : val));

/**
 * Zod schema for validating the LLM's JSON output against the
 * {@link ExtractedJd} shape. Used internally by {@link extractJdFromText}
 * with up to 2 retries on validation failure.
 *
 * The schema is intentionally lenient to handle common LLM output patterns:
 * - `null` instead of omitting optional fields
 * - `{text: "..."}` objects instead of plain strings in arrays
 * - Extra whitespace or empty strings
 */
export const ExtractedJdSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  location: nullableString,
  salary: nullableString,
  tags: z.array(z.string()).optional(),
  description: z.string().min(1),
  requirements: stringArray,
  qualifications: stringArray,
  benefits: stringArray,
  employmentType: nullableString,
  seniorityLevel: nullableString,
});
