import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMcpLogger, mcpLogger, getMcpLogPath } from '../logger.js';

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
    try {
      expect(createMcpLogger()).toBeDefined();
    } finally {
      if (prev === undefined) {
        delete process.env['JHO_CONFIG_HOME'];
      } else {
        process.env['JHO_CONFIG_HOME'] = prev;
      }
      await rm(testHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});
