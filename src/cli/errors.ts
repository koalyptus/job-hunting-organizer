/**
 * CLI-specific error classes for user input validation.
 * These are caught by the CLI action handler to display
 * user-friendly messages and exit with appropriate codes.
 */

/**
 * Error thrown when user input validation fails (e.g. empty clipboard,
 * empty stdin, TTY detection). Caught by the CLI to display
 * `error: <message>` and exit with code 1.
 */
export class UserInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserInputError';
  }
}
