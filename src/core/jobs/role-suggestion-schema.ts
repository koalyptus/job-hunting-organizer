import { z } from 'zod';

/**
 * Zod schema for validating the LLM's JSON output against the
 * {@link RoleSuggestion} shape. Used internally by {@link suggestTargetRole}
 * with up to 2 retries on validation failure.
 */
export const RoleSuggestionSchema = z.object({
  roleSlug: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
});
