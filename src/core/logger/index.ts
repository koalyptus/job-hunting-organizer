// Phase 9j: logger/logger.ts and logger/root-logger.ts moved to src/lib/logger/.
// This barrel re-exports from the new locations for backward compatibility.
// Deprecated — import from 'src/lib/logger/logger.js' directly.

export {
  isInteractive,
  createLogger,
  defaultLoggerConfig,
  getRootLogger,
  setRootLogger,
  childLogger,
  moduleLogger,
  closeLogger,
  logError,
} from '../../lib/logger/logger.js';
export { initRootLogger } from '../../lib/logger/root-logger.js';
