import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from 'pino';
import { createMcpLogger, mcpLogger, getMcpLogPath } from '../logger.js';
import { cleanupTempDir } from '../../core/tests/cleanup.js';

describe('mcpLogger', () => {
  it('creates a configured logger with file destination', () => {
    const log = createMcpLogger();
    expect(log).toBeDefined();
    log.info('test message');
  });

  it('exports a pre-built singleton', () => {
    expect(mcpLogger).toBeDefined();
    mcpLogger.info('singleton test');
  });

  it('getMcpLogPath returns the mcp log file', () => {
    expect(getMcpLogPath()).toContain('jho-mcp.log');
  });

  it('respects JHO_LOG_LEVEL', () => {
    const prev = process.env['JHO_LOG_LEVEL'];
    process.env['JHO_LOG_LEVEL'] = 'debug';
    try {
      expect(createMcpLogger().level).toBe('debug');
    } finally {
      if (prev === undefined) {
        delete process.env['JHO_LOG_LEVEL'];
      } else {
        process.env['JHO_LOG_LEVEL'] = prev;
      }
    }
  });

  it('creates the config home when missing', async () => {
    const testHome = await mkdtemp(join(tmpdir(), 'jho-mcplog-'));
    const prev = process.env['JHO_CONFIG_HOME'];
    process.env['JHO_CONFIG_HOME'] = join(testHome, 'no-such-dir');
    const loggers: Logger[] = [];
    try {
      const log = createMcpLogger();
      loggers.push(log);
      expect(log).toBeDefined();
      // The point of this test: the missing config home was created.
      expect(existsSync(join(testHome, 'no-such-dir'))).toBe(true);
    } finally {
      if (prev === undefined) {
        delete process.env['JHO_CONFIG_HOME'];
      } else {
        process.env['JHO_CONFIG_HOME'] = prev;
      }
      // The logger holds an open handle on jho-mcp.log; close it before rm
      // or Windows fails the delete with ENOTEMPTY.
      await cleanupTempDir(testHome, loggers);
    }
  });
});
