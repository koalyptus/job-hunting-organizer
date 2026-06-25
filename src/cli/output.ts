/**
 * Print a user-facing error message with visual symbol to stderr.
 * Does NOT exit - caller decides whether to exit.
 *
 * Output format: ✖ error: <message>
 *
 * @param message - The error message to display
 */
export function userError(message: string): void {
  process.stderr.write(`✖ error: ${message}\n`);
}

/**
 * Print a user-facing informational message to stderr.
 * Does NOT exit - for status updates, hints, stub messages.
 *
 * Output format: <message>
 *
 * @param message - The info message to display
 */
export function userInfo(message: string): void {
  process.stderr.write(`${message}\n`);
}

/**
 * Print a user-facing success message to stdout.
 * Does NOT exit - for successful operations that produce output for pipes.
 *
 * Output format: <message>
 *
 * @param message - The success message to display
 */
export function userSuccess(message: string): void {
  process.stdout.write(`${message}\n`);
}
