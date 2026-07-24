import { describe, it, expect } from 'vitest';
import { createMcpLogger, mcpLogger } from '../logger.js';

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
});
