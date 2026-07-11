import { loadGlobalConfig } from '../config/config.js';
import { defaultLoggerConfig, createLogger, setRootLogger, getRootLogger } from './logger.js';

/**
 * Initialize the root logger using the global config.
 * Called once at CLI startup before command parsing.
 *
 * Two-phase initialization to avoid circular dependency:
 * 1. Create a minimal root logger first (so config load errors are logged)
 * 2. Load global config, then reconfigure with proper settings
 */
export function initRootLogger(): void {
  // Phase 1: minimal root logger (defaults + env vars only)
  // This ensures any errors during config loading are captured
  setRootLogger(createLogger(defaultLoggerConfig({ correlationId: 'cli' })));

  // Phase 2: load global config and reconfigure
  const globalConfig = loadGlobalConfig();
  setRootLogger(
    createLogger(
      defaultLoggerConfig({
        level: globalConfig.logging?.level,
        disableFileLogging: globalConfig.logging?.disableFileLogging,
        file: globalConfig.logging?.file,
        redactPaths: globalConfig.logging?.redactPaths,
        correlationId: 'cli',
      }),
    ),
  );

  // Verify the logger was swapped
  const root = getRootLogger();
  root.debug('root logger initialized with config file settings');
}
