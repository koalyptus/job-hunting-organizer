/**
 * Print a user-facing error message with visual symbol to stderr.
 *
 * @param message - The error message to display
 */
export function userError(message: string): void {
  process.stderr.write(`✖ error: ${message}\n`);
}

/**
 * Print a user-facing informational message to stderr.
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
 *
 * Output format: <message>
 *
 * @param message - The success message to display
 */
export function userSuccess(message: string): void {
  process.stdout.write(`${message}\n`);
}
