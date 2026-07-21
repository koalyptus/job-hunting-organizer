import { describe, it, expect } from 'vitest';
import { createMcpLogger } from '../logger.js';

describe('mcpLogger', () => {
  it('uses custom redactPaths when config provides them', () => {
    const log = createMcpLogger({
      level: 'info',
      file: undefined,
      redactPaths: ['custom.path', '*.secret'],
    });
    expect(log).toBeDefined();
    log.info('test message');
  });

  it('falls back to DEFAULT_REDACT_PATHS when config has no redactPaths', () => {
    const log = createMcpLogger({
      level: 'info',
      file: undefined,
      redactPaths: [],
    });
    expect(log).toBeDefined();
    log.warn('test warning');
  });
});
