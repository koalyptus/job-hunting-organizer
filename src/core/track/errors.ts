/**
 * Custom errors for the track workflow. Core modules throw these instead
 * of calling `process.exit()`, making them testable and reusable
 * from the MCP server. The CLI action wrapper catches them and
 * handles the exit.
 */

/**
 * Thrown when the user cancels a prompt (e.g. Ctrl+C or selecting
 * "Cancel" in a confirm dialog). The CLI layer should exit with code 0.
 */
export class TrackCancelled extends Error {
  constructor() {
    super('Track cancelled.');
    this.name = 'TrackCancelled';
  }
}

/**
 * Thrown on a recoverable track error (missing profile, LLM failure,
 * extraction failure, etc.). The CLI layer should print the message
 * and exit with code 1.
 */
export class TrackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrackError';
  }
}

/**
 * Thrown when `jho track <slug> --refresh` is used but the application
 * has no `link` stored in its metadata. The CLI layer should suggest
 * using --paste as an alternative.
 */
export class NoLinkStoredError extends TrackError {
  constructor(slug: string) {
    super(`no link stored for ${slug}`);
    this.name = 'NoLinkStoredError';
  }
}

/**
 * Thrown when an invalid status value is provided. The kind field
 * holds the invalid value so the CLI layer can include accepted values
 * in its error message.
 */
export class InvalidStatusError extends TrackError {
  /** The invalid status value. */
  kind: string;

  constructor(status: string) {
    super(`invalid status "${status}"`);
    this.name = 'InvalidStatusError';
    this.kind = status;
  }
}
