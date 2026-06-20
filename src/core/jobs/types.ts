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
  /** Full job description as plain text. */
  description?: string;
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
}
