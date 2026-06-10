import ora from 'ora';
import type { Ora } from 'ora';
import { isInteractive } from '../core/logger.js';

/**
 * Create a spinner instance. Auto-disabled when stderr is not a TTY
 * (non-interactive CI, piped output). Returns a no-op spinner that
 * silently ignores start/stop/succeed/fail/etc so callers don't need
 * to branch on TTY detection.
 */
export function createSpinner(text?: string): Ora {
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
function noopSpinner(): Ora {
  const noop = () => spinner;
  const spinner = {
    start: noop,
    stop: noop,
    succeed: noop,
    fail: noop,
    warn: noop,
    info: noop,
    text: '',
  } as unknown as Ora;
  return spinner;
}
