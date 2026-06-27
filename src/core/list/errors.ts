/**
 * Custom errors for the list workflow. Core modules throw these instead
 * of calling `process.exit()`, making them testable and reusable
 * from the MCP server. The CLI action wrapper catches them and
 * handles the exit.
 */

/**
 * Thrown on a recoverable list error (invalid filter values, etc.).
 * The CLI layer should print the message and exit with code 1.
 */
export class ListError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ListError';
  }
}

/**
 * Thrown when an invalid status value is provided to the list filter.
 * The `kind` field holds the invalid value so the CLI layer can
 * include accepted values in its error message.
 */
export class InvalidListStatusError extends ListError {
  /** The invalid status value. */
  kind: string;

  constructor(status: string) {
    super(`invalid status "${status}"`);
    this.name = 'InvalidListStatusError';
    this.kind = status;
  }
}
