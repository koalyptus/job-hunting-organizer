import { createWriteStream, type WriteStream } from 'node:fs';
import { pino, type Logger, type LoggerOptions } from 'pino';
import type { LogLevel, LoggerConfig } from './types.js';

const DEFAULT_REDACT_PATHS: readonly string[] = [
  '*.apiKey',
  '*.token',
  '*.clientSecret',
  '*.password',
  '*.secret',
  'config.llm.apiKey',
  'config.github.token',
  'config.calendar.outlook.clientSecret',
  'cv.content',
  'jd.content',
  'coverLetter.content',
  'qa.question',
  'qa.answer',
  'retro.notes',
  'prep.content',
];

const TTY_TRANSPORT_TARGET = 'pino-pretty';

function isInteractive(stream: NodeJS.WriteStream | undefined): boolean {
  return Boolean(stream && (stream as NodeJS.WriteStream).isTTY);
}

function buildOptions(config: LoggerConfig): LoggerOptions {
  const options: LoggerOptions = {
    level: config.level,
    redact: {
      paths: config.redactPaths.length > 0 ? [...config.redactPaths] : [...DEFAULT_REDACT_PATHS],
      censor: '[REDACTED]',
    },
    base: {
      pid: process.pid,
      ...(config.correlationId !== undefined ? { cid: config.correlationId } : {}),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (config.isTty) {
    options.transport = {
      target: TTY_TRANSPORT_TARGET,
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
        singleLine: false,
      },
    };
  }

  return options;
}

export function createLogger(config: LoggerConfig): Logger {
  const options = buildOptions(config);
  if (config.file === undefined) {
    return pino(options);
  }
  const stream: WriteStream = createWriteStream(config.file, { flags: 'a' });
  return pino(options, stream);
}

export function defaultLoggerConfig(overrides: Partial<LoggerConfig> = {}): LoggerConfig {
  const level = (overrides.level ??
    (process.env['JHO_LOG_LEVEL'] as LogLevel | undefined) ??
    'info') as LogLevel;
  const file = overrides.file ?? process.env['JHO_LOG_FILE'];
  const isTty = overrides.isTty ?? isInteractive(process.stderr);
  return {
    level,
    isTty,
    ...(file !== undefined ? { file } : {}),
    redactPaths: overrides.redactPaths ?? [],
    ...(overrides.correlationId !== undefined ? { correlationId: overrides.correlationId } : {}),
  };
}

let _rootLogger: Logger | undefined;

export function getRootLogger(): Logger {
  if (_rootLogger === undefined) {
    _rootLogger = createLogger(defaultLoggerConfig());
  }
  return _rootLogger;
}

export function setRootLogger(logger: Logger): void {
  _rootLogger = logger;
}

export function childLogger(bindings: Record<string, unknown>, base?: Logger): Logger {
  return (base ?? getRootLogger()).child(bindings);
}

export { isInteractive };
