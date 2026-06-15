import ora from 'ora';
import { isInteractive } from './logger.js';

/**
 * Minimal interface for the subset of `Ora` we actually use.
 * Narrower than the full `Ora` type so the noop implementation
 * doesn't need to stub every method.
 */
export interface Spinner {
  start: () => Spinner;
  stop: () => Spinner;
  succeed: (text?: string) => Spinner;
  fail: (text?: string) => Spinner;
  warn: (text?: string) => Spinner;
  info: (text?: string) => Spinner;
  text: string;
}

/**
 * Create a spinner instance. Auto-disabled when stderr is not a TTY
 * (non-interactive CI, piped output). Returns a no-op spinner that
 * silently ignores start/stop/succeed/fail/etc so callers don't need
 * to branch on TTY detection.
 */
export function createSpinner(text?: string): Spinner {
  if (!isInteractive(process.stderr)) {
    return noopSpinner();
  }
  return ora({ text, stream: process.stderr, discardStdin: false });
}

/**
 * Run an async function with a spinner. The spinner shows `text` while
 * the function runs, then shows `successText` on completion. On error
 * the spinner stops and the error is re-thrown.
 */
export async function withSpinner<T>(
  text: string,
  successText: string,
  fn: () => Promise<T>,
): Promise<T> {
  const spinner = createSpinner(text).start();
  try {
    const result = await fn();
    spinner.succeed(successText);
    return result;
  } catch (error) {
    spinner.fail(String(error));
    throw error;
  }
}

/** No-op spinner for non-TTY contexts. */
function noopSpinner(): Spinner {
  const noop = () => self;
  const self: Spinner = {
    start: noop,
    stop: noop,
    succeed: noop,
    fail: noop,
    warn: noop,
    info: noop,
    text: '',
  };
  return self;
}
