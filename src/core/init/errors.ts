/**
 * Custom errors for the init wizard. Core modules throw these instead
 * of calling `process.exit()`, making them testable and reusable
 * from the MCP server. The CLI action wrapper catches them and
 * handles the exit.
 */

/**
 * Thrown when the user cancels a prompt (e.g. Ctrl+C or selecting
 * "Cancel" in a select menu). The CLI layer should exit with code 0.
 */
export class InitCancelled extends Error {
  constructor() {
    super('Init cancelled.');
    this.name = 'InitCancelled';
  }
}

/**
 * Thrown on a recoverable init error (bad campaign name, missing
 * file, etc.). The CLI layer should print the message and exit
 * with code 1.
 */
export class InitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InitError';
  }
}
