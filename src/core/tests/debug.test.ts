import { afterEach, describe, expect, it } from 'vitest';
import { createDebug, debug, enableFromEnv } from '../debug.js';

const originalDebug = process.env['DEBUG'];

afterEach(() => {
  if (originalDebug === undefined) {
    delete process.env['DEBUG'];
  } else {
    process.env['DEBUG'] = originalDebug;
  }
});

describe('debug()', () => {
  it('prefixes the namespace when not already prefixed', () => {
    const d = debug('fs');
    expect(d.namespace).toBe('jho:fs');
  });

  it('keeps the namespace when already prefixed', () => {
    const d = debug('jho:fs');
    expect(d.namespace).toBe('jho:fs');
  });

  it('keeps the bare namespace', () => {
    const d = debug('jho');
    expect(d.namespace).toBe('jho');
  });

  it('exports the raw createDebug as well', () => {
    expect(typeof createDebug).toBe('function');
  });
});

describe('enableFromEnv', () => {
  it('does not throw when DEBUG is unset', () => {
    delete process.env['DEBUG'];
    expect(() => enableFromEnv()).not.toThrow();
  });

  it('does not throw when DEBUG is set', () => {
    process.env['DEBUG'] = 'jho:*';
    expect(() => enableFromEnv()).not.toThrow();
  });
});
