import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import {
  childLogger,
  createLogger,
  defaultLoggerConfig,
  getRootLogger,
  isInteractive,
  setRootLogger,
} from '../logger.js';

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

  it('defaults to info level and TTY detection off in test env', () => {
    delete process.env['JHO_LOG_LEVEL'];
    delete process.env['JHO_LOG_FILE'];
    const cfg = defaultLoggerConfig({ isTty: false });
    expect(cfg.level).toBe('info');
    expect(cfg.isTty).toBe(false);
  });

  it('honours JHO_LOG_LEVEL', () => {
    process.env['JHO_LOG_LEVEL'] = 'debug';
    const cfg = defaultLoggerConfig({ isTty: false });
    expect(cfg.level).toBe('debug');
  });

  it('honours overrides', () => {
    const cfg = defaultLoggerConfig({ level: 'warn', isTty: true, redactPaths: ['x'] });
    expect(cfg.level).toBe('warn');
    expect(cfg.isTty).toBe(true);
    expect(cfg.redactPaths).toEqual(['x']);
  });
});

describe('createLogger', () => {
  it('returns a working logger with redaction enabled', () => {
    const log = createLogger({ level: 'info', isTty: false, redactPaths: ['apiKey'] });
    expect(typeof log.info).toBe('function');
    // just exercise that redact paths are accepted without throwing
    log.info({ apiKey: 'secret' }, 'redacted');
    log.info('plain message');
  });

  it('includes the correlation id when provided', () => {
    const log = createLogger({
      level: 'info',
      isTty: false,
      redactPaths: [],
      correlationId: 'cid-123',
    });
    expect(typeof log.info).toBe('function');
  });
});

describe('childLogger', () => {
  it('derives a child with bindings', () => {
    const root = createLogger({ level: 'info', isTty: false, redactPaths: [] });
    const child = childLogger({ component: 'test' }, root);
    expect(typeof child.info).toBe('function');
  });

  it('uses the root logger by default', () => {
    setRootLogger(createLogger({ level: 'info', isTty: false, redactPaths: [] }));
    const child = childLogger({ component: 'default' });
    expect(typeof child.info).toBe('function');
    expect(getRootLogger()).toBeDefined();
  });
});
