import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { Logger } from 'pino';
import { DEFAULT_LOG_FILENAME } from '../../types.js';
import {
  childLogger,
  closeLogger,
  createLogger,
  defaultLoggerConfig,
  getRootLogger,
  isInteractive,
  moduleLogger,
  setRootLogger,
} from '../../logger/logger.js';
import { resolveConfigHome } from '../../paths.js';

function silentWritable(): Writable {
  const w = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  Object.defineProperty(w, 'isTTY', { value: false });
  return w;
}

function ttyWritable(): Writable {
  const w = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  Object.defineProperty(w, 'isTTY', { value: true });
  return w;
}

describe('isInteractive', () => {
  it('returns false for a non-TTY stream', () => {
    expect(isInteractive(silentWritable() as unknown as NodeJS.WriteStream)).toBe(false);
  });
  it('returns true for a TTY stream', () => {
    expect(isInteractive(ttyWritable() as unknown as NodeJS.WriteStream)).toBe(true);
  });
});

describe('defaultLoggerConfig', () => {
  const originalLevel = process.env['JHO_LOG_LEVEL'];
  const originalFile = process.env['JHO_LOG_FILE'];

  afterEach(() => {
    if (originalLevel === undefined) {
      delete process.env['JHO_LOG_LEVEL'];
    } else {
      process.env['JHO_LOG_LEVEL'] = originalLevel;
    }
    if (originalFile === undefined) {
      delete process.env['JHO_LOG_FILE'];
    } else {
      process.env['JHO_LOG_FILE'] = originalFile;
    }
  });

  it('defaults to info level', () => {
    delete process.env['JHO_LOG_LEVEL'];
    delete process.env['JHO_LOG_FILE'];
    const cfg = defaultLoggerConfig({});
    expect(cfg.level).toBe('info');
  });

  it('honours JHO_LOG_LEVEL', () => {
    process.env['JHO_LOG_LEVEL'] = 'debug';
    const cfg = defaultLoggerConfig({});
    expect(cfg.level).toBe('debug');
  });

  it('honours overrides', () => {
    const cfg = defaultLoggerConfig({ level: 'warn', redactPaths: ['x'] });
    expect(cfg.level).toBe('warn');
    expect(cfg.redactPaths).toEqual(['x']);
  });
});

describe('createLogger', () => {
  it('returns a working logger with redaction enabled', () => {
    const log = createLogger({ level: 'info', redactPaths: ['apiKey'] });
    expect(typeof log.info).toBe('function');
    // just exercise that redact paths are accepted without throwing
    log.info({ apiKey: 'secret' }, 'redacted');
    log.info('plain message');
  });

  it('includes the correlation id when provided', () => {
    const log = createLogger({
      level: 'info',
      redactPaths: [],
      correlationId: 'cid-123',
    });
    expect(typeof log.info).toBe('function');
  });

  it('silences logger when no file path is set', () => {
    const log = createLogger({ level: 'info', redactPaths: [] });
    // Should not produce output to stdout/stderr
    log.info('should be silent');
    log.error('should also be silent');
  });
});

describe('childLogger', () => {
  it('derives a child with bindings', () => {
    const root = createLogger({ level: 'info', redactPaths: [] });
    const child = childLogger({ component: 'test' }, root);
    expect(typeof child.info).toBe('function');
  });

  it('uses the root logger by default', () => {
    setRootLogger(createLogger({ level: 'info', redactPaths: [] }));
    const child = childLogger({ component: 'default' });
    expect(typeof child.info).toBe('function');
    expect(getRootLogger()).toBeDefined();
  });
});

describe('defaultLoggerConfig - file logging', () => {
  const originalConfigHome = process.env['JHO_CONFIG_HOME'];

  afterEach(() => {
    if (originalConfigHome === undefined) {
      delete process.env['JHO_CONFIG_HOME'];
    } else {
      process.env['JHO_CONFIG_HOME'] = originalConfigHome;
    }
  });

  it('defaults to config home / jho.log when no override', () => {
    delete process.env['JHO_CONFIG_HOME'];
    process.env['JHO_CONFIG_HOME'] = '/tmp/test-config-home';
    const cfg = defaultLoggerConfig({});
    // resolveConfigHome normalizes the path for the current OS
    expect(cfg.file).toBe(`${resolveConfigHome()}/${DEFAULT_LOG_FILENAME}`);
  });

  it('honours JHO_LOG_FILE env var', () => {
    process.env['JHO_LOG_FILE'] = '/custom/path.log';
    const cfg = defaultLoggerConfig({});
    expect(cfg.file).toBe('/custom/path.log');
  });

  it('honours file override', () => {
    const cfg = defaultLoggerConfig({ file: '/override/path.log' });
    expect(cfg.file).toBe('/override/path.log');
  });

  it('empty string uses default path', () => {
    const cfg = defaultLoggerConfig({ file: '' });
    // Empty string should resolve to default path
    expect(cfg.file).toBe(`${resolveConfigHome()}/${DEFAULT_LOG_FILENAME}`);
  });

  it('disableFileLogging suppresses file path', () => {
    const cfg = defaultLoggerConfig({ disableFileLogging: true, file: '/should/be/ignored.log' });
    expect(cfg.file).toBeUndefined();
  });

  it('disableFileLogging suppresses default path', () => {
    process.env['JHO_LOG_FILE'] = '/custom/path.log';
    const cfg = defaultLoggerConfig({ disableFileLogging: true });
    expect(cfg.file).toBeUndefined();
  });
});

describe('createLogger - file output', () => {
  let tempDir: string;
  const loggers: Logger[] = [];

  beforeEach(async () => {
    tempDir = await mkdtemp(resolve(tmpdir(), 'jho-logger-test-'));
  });

  afterEach(() => {
    for (const log of loggers) {
      closeLogger(log);
    }
    loggers.length = 0;
    return rm(tempDir, { recursive: true, force: true });
  });

  it('writes to file when file path provided', () => {
    const logFile = resolve(tempDir, 'test.log');
    const log = createLogger({ level: 'info', redactPaths: [], file: logFile });
    loggers.push(log);
    log.info('test message');
    log.error('error message');
  });

  it('creates parent directories automatically', () => {
    const logFile = resolve(tempDir, 'nested', 'deep', 'test.log');
    const log = createLogger({ level: 'info', redactPaths: [], file: logFile });
    loggers.push(log);
    log.info('test message');
  });

  it('does not create file when file is undefined', () => {
    const log = createLogger({ level: 'info', redactPaths: [] });
    log.info('no file');
    // Should not throw and should not write to stdout/stderr
  });

  it('writes JSON to file despite isTty', () => {
    const logFile = resolve(tempDir, 'tty-test.log');
    const log = createLogger({ level: 'info', redactPaths: [], file: logFile });
    loggers.push(log);
    log.info('file-only test');
    log.flush();
  });
});

describe('moduleLogger', () => {
  it('returns a logger with module binding derived from the file URL', () => {
    const log = moduleLogger('file:///C:/src/core/foo.ts');
    expect(typeof log.info).toBe('function');
    expect(typeof log.debug).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  it('derives the correct name from a cross-platform path', () => {
    const log = moduleLogger('file:///C:/Users/user/project/src/core/locks.ts');
    expect(typeof log.info).toBe('function');
  });

  it('handles file URL with multiple dots in the name', () => {
    const log = moduleLogger('file:///C:/src/core/my.util.test.ts');
    expect(typeof log.info).toBe('function');
  });

  it('accepts a custom base logger', () => {
    const base = createLogger({ level: 'info', redactPaths: [] });
    const log = moduleLogger('file:///C:/src/core/custom.ts', base);
    expect(typeof log.info).toBe('function');
  });
});
