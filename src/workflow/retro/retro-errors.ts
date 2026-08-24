/**
 * Lightweight error classes for the retro workflow.
 * Import from here (instead of retro.js) when you only need
 * the error types — this avoids pulling in LLM, fs, and other
 * heavy dependencies via module-scope imports.
 */

export class RetroError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetroError';
  }
}

export class RetroNotFoundError extends RetroError {
  constructor(slug: string) {
    super(`retro not found: ${slug}`);
    this.name = 'RetroNotFoundError';
  }
}
