/**
 * Print a user-facing error message to stderr.
 *
 * @param message - The error message to display
 */
export function userError(message: string): void {
  process.stderr.write(`✖ error: ${message}\n`);
}

/**
 * Print a user-facing warning message to stderr.
 *
 * Used for stubs ("not implemented yet"), warnings, and status messages
 * that precede a non-zero exit.
 *
 * @param message - The warning message to display
 */
export function userWarn(message: string): void {
  process.stderr.write(`⚠ ${message}\n`);
}

/**
 * Print a user-facing informational message to stdout.
 *
 * @param message - The informational message to display
 */
export function userInfo(message: string): void {
  process.stdout.write(`ℹ ${message}\n`);
}

/**
 * Print a user-facing success message to stdout.
 *
 * @param message - The success message to display
 */
export function userSuccess(message: string): void {
  process.stdout.write(`✔ ${message}\n`);
}

/**
 * Print raw command output to stdout.
 *
 * Used for command results: lists, stats, JSON, file paths, and other
 * data that should go to stdout without any prefix.
 *
 * @param message - The output to display
 */
export function userOutput(message: string): void {
  process.stdout.write(`${message}\n`);
}
