/**
 * Lightweight error classes for the cover-letter workflow.
 * Import from here (instead of cover-letter.js) when you only need
 * the error types — this avoids pulling in LLM, fs, and other
 * heavy dependencies via module-scope imports.
 */

/**
 * Thrown when the cover letter generation fails.
 */
export class CoverLetterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoverLetterError';
  }
}

/**
 * Thrown when the cover letter cannot be read.
 */
export class CoverLetterReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoverLetterReadError';
  }
}
