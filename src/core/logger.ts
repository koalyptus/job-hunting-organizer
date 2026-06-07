import { createWriteStream, type WriteStream } from 'node:fs';
import { pino, type Logger, type LoggerOptions } from 'pino';
import type { LogLevel, LoggerConfig } from './types.js';
import { SECRET_PATHS } from './config.view.js';

/**
 * Default redaction paths applied when the user config has an empty
 * `redactPaths`. The list has two pieces:
 *
 * 1. **Wildcards** that catch any field whose key name suggests a
 *    secret, at any depth. Self-maintaining: a future field called
 *    `apiKey` (or `token`, `clientSecret`, `password`, `secret`) is
 *    auto-redacted without touching this file.
 * 2. **Explicit config paths** derived from {@link SECRET_PATHS}, the
 *    same list that powers `redactSecrets`. A single source of truth
 *    for "where do secrets live" — renaming a field in the schema
 *    updates the redaction automatically.
 *
 * Application content paths (e.g. `cv.content`, `jd.content`,
 * `coverLetter.content`, `qa.answer`) are intentionally NOT included
 * here — they will land in Phase 3+ when the `meta.md` schema is
 * typed, and at that point they'll be derived the same way (single
 * source of truth, not a manually maintained list).
 *
 * The user can always override or extend this list via
 * `logging.redactPaths` in the config.
 */
const DEFAULT_REDACT_PATHS: readonly string[] = [
  '*.apiKey',
  '*.token',
  '*.clientSecret',
  '*.password',
  '*.secret',
  ...SECRET_PATHS.map((s) => s.path.join('.')),
];

/** The `pino` transport name used for pretty TTY output. */
const TTY_TRANSPORT_TARGET = 'pino-pretty';

/**
 * Detect whether a stream is attached to a terminal. Exported so
 * callers (and the tests) can use the same TTY probe the logger
 * uses internally to pick between pretty and JSON output.
 * @param stream - A `WriteStream` like `process.stderr`.
 * @returns `true` only when the stream is a real TTY.
 */
export function isInteractive(stream: NodeJS.WriteStream | undefined): boolean {
  return Boolean(stream && (stream as NodeJS.WriteStream).isTTY);
}

/**
 * Translate a {@link LoggerConfig} into the `pino` options shape.
 * The TTY path wires up `pino-pretty` so interactive terminals get
 * color, condensed timestamps, and no `pid` / `hostname` noise. The
 * non-TTY path emits JSON, which is what the CLI's `pino-pretty`
 * consumer expects when `--no-color` is set or stdout is piped.
 * @param config - Resolved logger config.
 * @returns A `pino` `LoggerOptions` object.
 */
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

/**
 * Build a `pino` {@link Logger} from a {@link LoggerConfig}. When
 * `config.file` is set the logger writes append-only to that file
 * (and only to the file) — useful for debugging a long-running MCP
 * session without polluting the TTY. When unset, pino picks the
 * default destination (stdout for the worker thread, but the CLI
 * redirects via `pino.final` if needed).
 * @param config - Resolved logger config.
 * @returns A configured `pino` logger.
 */
export function createLogger(config: LoggerConfig): Logger {
  const options = buildOptions(config);
  if (config.file === undefined) {
    return pino(options);
  }
  const stream: WriteStream = createWriteStream(config.file, { flags: 'a' });
  return pino(options, stream);
}

/**
 * Build a {@link LoggerConfig} by layering `overrides` on top of the
 * `JHO_LOG_LEVEL` / `JHO_LOG_FILE` environment variables and the
 * `process.stderr.isTTY` probe. Returns a fully-populated config the
 * caller can pass straight to {@link createLogger}.
 * @param overrides - Caller-supplied overrides (typically from the
 *   parsed `config.json`'s `logging` block).
 * @returns A `LoggerConfig` with all fields set.
 */
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

/** Module-level singleton, lazily created on first {@link getRootLogger}. */
let _rootLogger: Logger | undefined;

/**
 * Return the process-wide root logger, creating it from
 * {@link defaultLoggerConfig} on first call. Subsequent calls return
 * the same instance so child loggers share a destination and
 * correlation id.
 * @returns The singleton root logger.
 */
export function getRootLogger(): Logger {
  if (_rootLogger === undefined) {
    _rootLogger = createLogger(defaultLoggerConfig());
  }
  return _rootLogger;
}

/**
 * Replace the root logger. Used by the CLI startup path to inject a
 * logger built from the merged config (which has already resolved
 * `JHO_LOG_LEVEL` etc.), and by tests that want a silent logger.
 * @param logger - The new root logger.
 */
export function setRootLogger(logger: Logger): void {
  _rootLogger = logger;
}

/**
 * Build a child logger with extra bindings. Without a `base` argument
 * the child is hung off {@link getRootLogger}, which is the common
 * case — a single command attaches `cmd`, `campaign`, etc. to every
 * log line.
 * @param bindings - Key/value pairs added to every log record.
 * @param base - Optional parent logger. Defaults to the root logger.
 * @returns A new `pino` logger with the bindings pre-attached.
 */
export function childLogger(bindings: Record<string, unknown>, base?: Logger): Logger {
  return (base ?? getRootLogger()).child(bindings);
}
