import pino from 'pino';
import { defaultLoggerConfig, DEFAULT_REDACT_PATHS } from '../core/logger/logger.js';
import { getPackageVersion } from '../core/package.js';

/**
 * MCP server logger — stderr only, never stdout.
 * In stdio mode, stdout is reserved for JSON-RPC framing.
 * Pino writes to stderr by default when no transport is specified.
 *
 * Uses the shared redaction paths and service metadata from the core
 * logger so secrets are never leaked and structured log lines are
 * consistent with CLI output.
 */
function createMcpLogger() {
  const config = defaultLoggerConfig({ disableFileLogging: true });
  const redactPaths =
    config.redactPaths.length > 0 ? [...config.redactPaths] : [...DEFAULT_REDACT_PATHS];
  return pino({
    level: process.env.JHO_LOG_LEVEL ?? config.level,
    redact: { paths: redactPaths, censor: '[REDACTED]' },
    base: {
      pid: process.pid,
      service: { name: 'jho-mcp', version: getPackageVersion() },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export const mcpLogger = createMcpLogger();
