import pino from 'pino';
import { defaultLoggerConfig, DEFAULT_REDACT_PATHS } from '../core/logger/logger.js';
import { getPackageVersion } from '../core/package.js';
import { resolveConfigHome } from '../core/paths.js';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

function ensureMcpLogDir(): string {
  const configHome = resolveConfigHome();
  if (!existsSync(configHome)) {
    mkdirSync(configHome, { recursive: true });
  }
  return resolve(configHome, 'jho-mcp.log');
}

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
    pino.destination(ensureMcpLogDir()),
  );
}

export const mcpLogger = createMcpLogger();

export function getMcpLogPath(): string {
  return resolve(resolveConfigHome(), 'jho-mcp.log');
}
