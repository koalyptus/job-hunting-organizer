import pino from 'pino';
import { defaultLoggerConfig, DEFAULT_REDACT_PATHS } from '../lib/logger/logger.js';
import { getPackageVersion } from '../lib/package.js';
import { resolveConfigHome } from '../lib/paths.js';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

/**
 * Ensure the MCP log directory exists and return the log file path.
 *
 * @returns The full path to the MCP log file.
 */
function ensureMcpLogDir(): string {
  const configHome = resolveConfigHome();
  if (!existsSync(configHome)) {
    mkdirSync(configHome, { recursive: true });
  }
  return resolve(configHome, 'jho-mcp.log');
}

/**
 * Create a Pino logger configured for the MCP server.
 * Writes structured JSON logs to the MCP log file with redaction support.
 *
 * @returns A configured Pino logger instance.
 */
export function createMcpLogger() {
  const config = defaultLoggerConfig({ disableFileLogging: true });
  const redactPaths =
    config.redactPaths.length > 0 ? [...config.redactPaths] : [...DEFAULT_REDACT_PATHS];

  return pino(
    {
      level: process.env.JHO_LOG_LEVEL ?? config.level,
      redact: { paths: redactPaths, censor: '[REDACTED]' },
      base: {
        pid: process.pid,
        service: { name: 'jho-mcp', version: getPackageVersion() },
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    pino.destination({ dest: ensureMcpLogDir(), sync: true }),
  );
}

export const mcpLogger = createMcpLogger();

/**
 * Get the full path to the MCP log file.
 *
 * @returns The absolute path to jho-mcp.log.
 */
export function getMcpLogPath(): string {
  return resolve(resolveConfigHome(), 'jho-mcp.log');
}
