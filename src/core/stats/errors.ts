/**
 * Custom errors for the stats workflow. Core modules throw these instead
 * of calling `process.exit()`, making them testable and reusable
 * from the MCP server. The CLI action wrapper catches them and
 * handles the exit.
 */

/**
 * Thrown on a recoverable stats error. The CLI layer should print
 * the message and exit with code 1.
 */
export class StatsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StatsError';
  }
}

/**
 * Thrown when an invalid `--since` value is provided.
 * The `kind` field holds the invalid value so the CLI layer can
 * include accepted formats in its error message.
 */
export class InvalidSinceError extends StatsError {
  /** The invalid since value. */
  kind: string;

  constructor(since: string) {
    super(`invalid --since value "${since}"`);
    this.name = 'InvalidSinceError';
    this.kind = since;
  }
}
