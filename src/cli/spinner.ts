/**
 * CLI spinner wrapper. Re-exports from core/spinner.ts.
 * The canonical implementation lives in core/ so that core modules
 * (like init/profile.ts) don't need a reverse dependency on cli/.
 */
export { createSpinner, withSpinner } from '../core/spinner.js';
export type { Spinner } from '../core/spinner.js';
