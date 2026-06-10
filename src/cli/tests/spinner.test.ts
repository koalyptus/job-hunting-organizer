import { describe, expect, it } from 'vitest';
import { createSpinner, withSpinner } from '../spinner.js';

describe('createSpinner', () => {
  it('returns a spinner object with expected methods', () => {
    const spinner = createSpinner('test');
    expect(spinner).toBeDefined();
    expect(typeof spinner.start).toBe('function');
    expect(typeof spinner.stop).toBe('function');
    expect(typeof spinner.succeed).toBe('function');
    expect(typeof spinner.fail).toBe('function');
    expect(typeof spinner.warn).toBe('function');
    expect(typeof spinner.info).toBe('function');
  });

  it('accepts text parameter', () => {
    const spinner = createSpinner('loading...');
    expect(spinner).toBeDefined();
  });

  it('works without text parameter', () => {
    const spinner = createSpinner();
    expect(spinner).toBeDefined();
  });
});

describe('withSpinner', () => {
  it('returns the result of the async function', async () => {
    const result = await withSpinner('loading', 'done', async () => 42);
    expect(result).toBe(42);
  });

  it('returns string results', async () => {
    const result = await withSpinner('loading', 'done', async () => 'hello');
    expect(result).toBe('hello');
  });

  it('returns object results', async () => {
    const result = await withSpinner('loading', 'done', async () => ({ key: 'value' }));
    expect(result).toEqual({ key: 'value' });
  });

  it('re-throws errors from the async function', async () => {
    await expect(
      withSpinner('loading', 'done', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });
});
