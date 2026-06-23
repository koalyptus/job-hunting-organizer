/**
 * Structured job description extracted from raw text by an LLM.
 * Returned by {@link extractJdFromText} and {@link extractJdFromUrl}.
 * Every field except `title` and `company` is optional — not all JDs
 * contain all fields.
 */
export interface ExtractedJd {
  /** Job title (required). */
  title: string;
  /** Company name (required). */
  company: string;
  /** Freeform location text. */
  location?: string;
  /** Salary or pay range text. */
  salary?: string;
  /** Classification tags (e.g. `['typescript', 'react']`). */
  tags?: string[];
  /** Full original job posting text (required). Stored for later reference. */
  description: string;
  /** List of requirements. */
  requirements?: string[];
  /** List of qualifications / nice-to-haves. */
  qualifications?: string[];
  /** Benefits or perks listed. */
  benefits?: string[];
  /** Employment type (e.g. `'full-time'`, `'contract'`). */
  employmentType?: string;
  /** Seniority level (e.g. `'senior'`, `'staff'`). */
  seniorityLevel?: string;
  /**
   * Raw text passed to the LLM for extraction. Populated by both
   * {@link extractJdFromText} (paste/stdin) and {@link extractJdFromUrl}
   * (URL fetch). Stored for later reference (e.g. `jd.md` fetched-jd region).
   */
  rawText?: string;
}

/**
 * Result of an LLM-backed target-role suggestion.
 * Returned by {@link suggestTargetRole}.
 */
export interface RoleSuggestion {
  /** Slug of the best-matching target role, or empty string if no match. */
  roleSlug: string;
  /** Match confidence (0–1). 0 means no match found. */
  confidence: number;
  /** LLM reasoning for the match (or why none was found). */
  reasoning: string;
}
