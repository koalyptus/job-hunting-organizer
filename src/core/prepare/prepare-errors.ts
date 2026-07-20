/**
 * Lightweight error classes for the prepare workflow.
 * Import from here (instead of prepare.js) when you only need
 * the error types — this avoids pulling in LLM, fs, and other
 * heavy dependencies via module-scope imports.
 */

/**
 * Thrown when prep plan generation fails.
 */
export class PrepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrepError';
  }
}

/**
 * Thrown when no prep plan exists for an application.
 */
export class PrepNotFoundError extends PrepError {
  constructor(slug: string) {
    super(`prep not found: ${slug}`);
    this.name = 'PrepNotFoundError';
  }
}

/**
 * Thrown when reading an existing prep plan fails.
 */
export class PrepReadError extends PrepError {
  constructor(message: string) {
    super(message);
    this.name = 'PrepReadError';
  }
}
