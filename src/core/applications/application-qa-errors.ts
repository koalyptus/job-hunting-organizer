/**
 * Lightweight error classes for the application Q&A workflow.
 * Import from here (instead of application-qa.js) when you only need
 * the error types — this avoids pulling in LLM, fs, and other
 * heavy dependencies via module-scope imports.
 */

/**
 * Thrown when the Q&A generation fails.
 */
export class AnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnswerError';
  }
}

/**
 * Thrown when the Q&A file cannot be read.
 */
export class QaReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QaReadError';
  }
}
