import { mkdirSync } from 'node:fs';
import { basename, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
// Default import carries the full namespace merge (including .symbols) that
// TypeScript doesn't expose on named imports from CJS modules with NodeNext.
import pino, { type Logger, type LoggerOptions } from 'pino';
import { DEFAULT_LOG_FILENAME, type LogLevel, type LoggerConfig } from '../types.js';
import { SECRET_PATHS } from '../config.view.js';
import { resolveConfigHome } from '../paths.js';
import { getPackageVersion } from '../package.js';

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

/**
 * Detect whether a stream is attached to a terminal.
 * @param stream - A `WriteStream` like `process.stderr`.
 * @returns `true` only when the stream is a real TTY.
 */
export function isInteractive(stream: NodeJS.WriteStream | undefined): boolean {
  return Boolean(stream && (stream as NodeJS.WriteStream).isTTY);
}

/**
 * Translate a {@link LoggerConfig} into the `pino` options shape.
 * Logs are always written as JSON (no pretty-printing). Terminal output
 * is never produced — the CLI reserves stdout for command results and
 * stderr for user-facing errors.
 * @param config - Resolved logger config.
 * @returns A `pino` `LoggerOptions` object.
 */
function buildOptions(config: LoggerConfig): LoggerOptions {
  return {
    level: config.level,
    redact: {
      paths: config.redactPaths.length > 0 ? [...config.redactPaths] : [...DEFAULT_REDACT_PATHS],
      censor: '[REDACTED]',
    },
    base: {
      pid: process.pid,
      service: { name: 'jho', version: getPackageVersion() },
      ...(config.correlationId !== undefined ? { cid: config.correlationId } : {}),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
}

/**
 * Build a `pino` {@link Logger} from a {@link LoggerConfig}. When a
 * `file` path is set the logger writes append-only JSON to that path
 * (and only to the path) — useful for debugging a long-running MCP
 * session or inspecting a CLI command's output after the fact. When
 * `file` is undefined the logger is silenced (level `'silent'`) so no
 * output reaches stdout or stderr.
 *
 * Terminal output for logs is intentionally never produced — see
 * {@link buildOptions} for the rationale.
 * @param config - Resolved logger config.
 * @returns A configured `pino` logger.
 */
export function createLogger(config: LoggerConfig): Logger {
  const options = buildOptions(config);
  if (config.file === undefined) {
    // Silence the logger when there is no file destination. Without this
    // guard pino defaults to stdout, which would pollute command output.
    options.level = 'silent';
    return pino(options);
  }
  mkdirSync(dirname(config.file), { recursive: true });
  // Use pino.destination with sync: true so writes are flushed to disk
  // before `log.error()` returns. This is critical for short-lived CLI
  // commands that log an error and immediately process.exit() — without
  // sync mode the file might never be created because the WriteStream
  // opens lazily and the process terminates before the buffer is flushed.
  const dest = pino.destination({ dest: config.file, sync: true, mkdir: false });
  return pino(options, dest);
}

/**
 * Build a {@link LoggerConfig} by layering `overrides` on top of the
 * `JHO_LOG_LEVEL` / `JHO_LOG_FILE` environment variables. Returns a
 * fully-populated config the caller can pass straight to
 * {@link createLogger}.
 *
 * When `disableFileLogging` is `true` the final config's `file` field
 * is forced to `undefined` (no file output) regardless of any other
 * setting. When it is `false` (or absent) the file path is resolved
 * from: override → `JHO_LOG_FILE` → `<configHome>/jho.log`.
 * @param overrides - Caller-supplied overrides (typically from the
 *   parsed `config.json`'s `logging` block).
 * @returns A `LoggerConfig` with all fields set.
 */
export function defaultLoggerConfig(
  overrides: Partial<LoggerConfig & { disableFileLogging?: boolean }> = {},
): LoggerConfig {
  const level = (overrides.level ??
    (process.env['JHO_LOG_LEVEL'] as LogLevel | undefined) ??
    'info') as LogLevel;

  // disableFileLogging is a hard override — when true, suppress file output entirely.
  const explicitFile = overrides.file ?? process.env['JHO_LOG_FILE'];
  const file = overrides.disableFileLogging
    ? undefined
    : explicitFile || `${resolveConfigHome()}/${DEFAULT_LOG_FILENAME}`;

  return {
    level,
    ...(file ? { file } : {}),
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

export function moduleLogger(metaUrl: string, base?: Logger): Logger {
  const name = basename(fileURLToPath(metaUrl), extname(fileURLToPath(metaUrl)));
  return childLogger({ module: name }, base);
}

/**
 * Gracefully shut down a pino logger: flush pending writes and close the
 * underlying stream. Intended for test teardown; production use should let
 * the process exit or call {@link setRootLogger} with a fresh logger.
 * @param log - The logger to close.
 */
export function closeLogger(log: Logger): void {
  log.flush();
  // The Logger type has no symbol index, but pino.symbols.streamSym is a
  // documented API for reaching the internal destination stream.
  const stream = (log as unknown as Record<symbol, unknown>)[pino.symbols.streamSym] as
    | { destroy?: () => void }
    | undefined;
  stream?.destroy?.();
}

/**
 * Standardized error logging shape. Logs an error with a consistent
 * structure for observability: type, code, message, and stack.
 * @param log - Logger instance.
 * @param err - Error to log (Error instance or plain object).
 * @param msg - Human-readable message describing the failure context.
 * @param bindings - Additional context (e.g. { cmd: 'track', campaign: 'default' }).
 */
export function logError(
  log: Logger,
  err: unknown,
  msg: string,
  bindings: Record<string, unknown> = {},
): void {
  const errorInfo: Record<string, unknown> = {};
  // Check for Error instance first, then check for error-like objects
  const isErrorInstance = err instanceof Error;
  const ctorName = (err && typeof err === 'object' && err.constructor?.name) as string | undefined;
  const isErrorLike = err && typeof err === 'object' && ('name' in err || 'message' in err);

  if (isErrorInstance || ctorName === 'Error' || ctorName?.endsWith('Error')) {
    const e = err as Error;
    errorInfo.type = e.name ?? ctorName ?? 'Error';
    errorInfo.code = (e as NodeJS.ErrnoException).code ?? undefined;
    errorInfo.message = e.message;
    if (e.stack) {
      errorInfo.stack = e.stack;
    }
  } else if (isErrorLike) {
    errorInfo.type = (err as Record<string, unknown>).name ?? 'UnknownError';
    errorInfo.code = (err as Record<string, unknown>).code ?? undefined;
    errorInfo.message = (err as Record<string, unknown>).message ?? String(err);
  } else {
    errorInfo.type = 'UnknownError';
    errorInfo.message = String(err);
  }
  // Use 'error' instead of 'err' to avoid pino's special Error serialization
  log.error({ error: errorInfo, ...bindings }, msg);
}
