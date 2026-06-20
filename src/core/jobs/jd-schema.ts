import { z } from 'zod';

/**
 * Zod schema for validating the LLM's JSON output against the
 * {@link ExtractedJd} shape. Used internally by {@link extractJdFromText}
 * with up to 2 retries on validation failure.
 */
export const ExtractedJdSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().optional(),
  salary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
  requirements: z.array(z.string()).optional(),
  qualifications: z.array(z.string()).optional(),
  benefits: z.array(z.string()).optional(),
  employmentType: z.string().optional(),
  seniorityLevel: z.string().optional(),
});
