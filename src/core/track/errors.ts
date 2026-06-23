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
