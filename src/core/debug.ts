import createDebug, { type Debugger } from 'debug';

/** Top-level namespace every jho debug channel sits under. */
const NAMESPACE = 'jho';

/**
 * Get a `debug`-style logger namespaced under `jho:*`. If the caller
 * already passed a `jho:`-prefixed (or bare `jho`) name it is used
 * verbatim; otherwise the prefix is added automatically so a typo
 * like `debug('slugs')` still produces the channel `jho:slugs`.
 *
 * Output is gated by the `DEBUG` env var (e.g. `DEBUG=jho:*` for
 * everything, `DEBUG=jho:fs,jho:lock` for a subset) and is disabled
 * by default — these logs are for development only and never reach
 * a user in production.
 * @param namespace - The channel name, with or without the `jho:`
 *   prefix.
 * @returns A `Debugger` that writes to `stderr` when enabled.
 */
export function debug(namespace: string): Debugger {
  if (!namespace.startsWith(`${NAMESPACE}:`) && namespace !== NAMESPACE) {
    return createDebug(`${NAMESPACE}:${namespace}`);
  }
  return createDebug(namespace);
}

/**
 * Enable the channels named in `$DEBUG` (if set). Idempotent: calling
 * it twice with the same value is harmless. The CLI calls this once
 * during startup, before any command, so per-command debug output is
 * available regardless of which command runs first.
 */
export function enableFromEnv(): void {
  const env = process.env['DEBUG'];
  if (env !== undefined && env !== '') {
    createDebug.enable(env);
  }
}

/**
 * Re-export of the `debug` factory so consumers can do
 * `import { createDebug } from '../core/debug.js'` without taking a
 * direct dependency on the upstream package. Lets us swap the
 * implementation in one place if we ever need to.
 */
export { createDebug };
