import { describe, expect, it } from 'vitest';
import { redactSecrets, setAtPath } from '../../config/config.view.js';
import type { GlobalConfig } from '../../../core/types.js';

// Test fixture: a fully-populated config shape that matches
// `GlobalConfig` structurally. `redactSecrets` only walks the secret
// paths, so the `dataRoot` value is irrelevant to the test — it just
// has to be present for the type to match.
const SAMPLE_GLOBAL: GlobalConfig = {
  version: 1,
  dataRoot: '/somewhere/jho',
  llm: {
    baseUrl: 'https://api.example.com',
    apiKey: 'sk-secret-abc',
    model: 'gpt-x',
    timeoutMs: 300_000,
  },
  github: { user: 'me', token: 'ghp-secret-xyz', repos: ['me/repo'] },
  logging: { level: 'info', file: '/tmp/jho.log', redactPaths: [] },
  fetch: { timeoutMs: 30_000 },
};

describe('redactSecrets', () => {
  it('replaces the LLM API key', () => {
    const redacted = redactSecrets(SAMPLE_GLOBAL);
    expect(redacted.llm.apiKey).toContain('***');
    expect(redacted.llm.apiKey).toContain('LLM_API_KEY');
  });

  it('replaces the GitHub token', () => {
    const redacted = redactSecrets(SAMPLE_GLOBAL);
    expect(redacted.github.token).toContain('***');
    expect(redacted.github.token).toContain('GITHUB_TOKEN');
  });

  it('preserves non-secret fields', () => {
    const redacted = redactSecrets(SAMPLE_GLOBAL);
    expect(redacted.llm.model).toBe('gpt-x');
    expect(redacted.github.user).toBe('me');
  });

  it('does not mutate the input', () => {
    redactSecrets(SAMPLE_GLOBAL);
    expect(SAMPLE_GLOBAL.llm.apiKey).toBe('sk-secret-abc');
    expect(SAMPLE_GLOBAL.github.token).toBe('ghp-secret-xyz');
  });

  it('handles config with missing secret branches gracefully', () => {
    const minimal = { version: 1, dataRoot: '/tmp' };
    const result = redactSecrets(minimal);
    expect(result).toEqual(minimal);
  });

  it('handles nullish intermediate paths gracefully', () => {
    const config = { version: 1, llm: null, dataRoot: '/tmp' };
    const result = redactSecrets(config);
    expect(result.llm).toBeNull();
  });

  it('handles config with missing nested secret paths', () => {
    const config = { version: 1, dataRoot: '/tmp' };
    const result = redactSecrets(config);
    expect(result).toEqual(config);
  });

  it('handles llm as string (non-object intermediate) gracefully', () => {
    const config = {
      version: 1,
      dataRoot: '/tmp',
      llm: 'not-an-object',
      github: { user: 'me', token: 'tok' },
    };
    const result = redactSecrets(config as unknown as GlobalConfig);
    // llm.apiKey cannot be redacted when llm is a string → remains untouched
    expect((result as unknown as Record<string, unknown>).llm).toBe('not-an-object');
    // github.token still redacted
    expect((result as unknown as Record<string, unknown>).github).toBeDefined();
  });

  it('handles llm as number (non-object intermediate) gracefully', () => {
    const config = { version: 1, dataRoot: '/tmp', llm: 123, github: null };
    const result = redactSecrets(config as unknown as GlobalConfig);
    expect((result as unknown as Record<string, unknown>).llm).toBe(123);
  });
});

describe('setAtPath', () => {
  it('ignores empty path', () => {
    const obj: Record<string, unknown> = { a: 1 };
    setAtPath(obj, [], 'x');
    expect(obj).toEqual({ a: 1 });
  });

  it('aborts when intermediate is null', () => {
    const obj: Record<string, unknown> = { a: null };
    setAtPath(obj, ['a', 'b'], 'x');
    expect(obj).toEqual({ a: null });
  });

  it('aborts when intermediate is non-object', () => {
    const obj: Record<string, unknown> = { a: 'string' };
    setAtPath(obj, ['a', 'b'], 'x');
    expect(obj).toEqual({ a: 'string' });
  });

  it('aborts when leaf parent is non-object', () => {
    const obj: Record<string, unknown> = { a: 'string' };
    setAtPath(obj, ['a'], 'x');
    // When path length is 1, loop not entered; cur is obj itself (object), so it sets obj.a
    // To hit leaf-parent non-object, need path like ['a','b'] where a is non-object already handled above;
    // For single-segment where obj itself is non-object:
    const nonObj = 'not-obj' as unknown as Record<string, unknown>;
    setAtPath(nonObj, ['x'], 'val');
    // no throw
  });

  it('aborts when an intermediate key is missing', () => {
    const obj: Record<string, unknown> = { a: { b: 1 } };
    setAtPath(obj, ['a', 'missing', 'deep'], 'x');
    expect(obj).toEqual({ a: { b: 1 } });
  });

  it('aborts when intermediate becomes null mid-path', () => {
    const obj: Record<string, unknown> = { a: { b: null } };
    setAtPath(obj, ['a', 'b', 'c'], 'x');
    expect(obj).toEqual({ a: { b: null } });
  });

  it('sets value at nested path', () => {
    const obj: Record<string, unknown> = { llm: { apiKey: 'old' } };
    setAtPath(obj, ['llm', 'apiKey'], 'new');
    expect((obj.llm as Record<string, unknown>).apiKey).toBe('new');
  });

  it('aborts when cur is not object at leaf-parent check', () => {
    const obj: Record<string, unknown> = { llm: null as unknown as Record<string, unknown> };
    setAtPath(obj, ['llm', 'apiKey'], 'x');
    expect(obj.llm).toBeNull();
  });
});

describe('setAtPath loop-body guard (migrated from cv-loop.test.ts)', () => {
  it('returns when nested intermediate is null', () => {
    const obj = { a: null };
    setAtPath(obj, ['a', 'b', 'c'], 'x');
    expect(obj).toEqual({ a: null });
  });
  it('returns when nested intermediate is a string', () => {
    const obj = { a: { b: 'string' } };
    setAtPath(obj, ['a', 'b', 'c'], 'x');
    expect(obj).toEqual({ a: { b: 'string' } });
  });
  it('returns when nested intermediate is a number', () => {
    const obj = { a: { b: 123 } };
    setAtPath(obj, ['a', 'b', 'c'], 'x');
    expect(obj).toEqual({ a: { b: 123 } });
  });
  it('returns when nested intermediate is a boolean', () => {
    const obj = { a: { b: true } };
    setAtPath(obj, ['a', 'b', 'c'], 'x');
    expect(obj).toEqual({ a: { b: true } });
  });
});
