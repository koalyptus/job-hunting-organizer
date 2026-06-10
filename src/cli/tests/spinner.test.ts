import { describe, expect, it, vi } from 'vitest';
import { createSpinner, withSpinner } from '../spinner.js';

const oraMock = vi.hoisted(() =>
  vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    info: vi.fn().mockReturnThis(),
    text: '',
  })),
);

vi.mock('ora', () => ({ default: oraMock }));

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

  it('returns a noop spinner when stderr is not interactive', () => {
    const originalIsTTY = process.stderr.isTTY;
    Object.defineProperty(process.stderr, 'isTTY', { value: false, configurable: true });

    oraMock.mockClear();
    const spinner = createSpinner('test');
    spinner.start();
    spinner.stop();

    expect(oraMock).not.toHaveBeenCalled();

    Object.defineProperty(process.stderr, 'isTTY', { value: originalIsTTY, configurable: true });
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
