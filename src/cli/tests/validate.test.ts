import { describe, expect, it } from 'vitest';
import { validateTailOption, validateLevelOption } from '../validate.js';

describe('validateTailOption', () => {
  it('accepts positive integers', () => {
    expect(validateTailOption('1')).toBeNull();
    expect(validateTailOption('10')).toBeNull();
    expect(validateTailOption('100')).toBeNull();
  });

  it('rejects zero', () => {
    expect(validateTailOption('0')).toBe('--tail must be a positive integer');
  });

  it('rejects negative numbers', () => {
    expect(validateTailOption('-1')).toBe('--tail must be a positive integer');
    expect(validateTailOption('-10')).toBe('--tail must be a positive integer');
  });

  it('rejects non-numeric strings', () => {
    expect(validateTailOption('abc')).toBe('--tail must be a positive integer');
    expect(validateTailOption('1.5')).toBe('--tail must be a positive integer');
  });

  it('rejects empty string', () => {
    expect(validateTailOption('')).toBe('--tail must be a positive integer');
  });
});

describe('validateLevelOption', () => {
  it('accepts valid levels (case insensitive)', () => {
    expect(validateLevelOption('fatal')).toBeNull();
    expect(validateLevelOption('error')).toBeNull();
    expect(validateLevelOption('warn')).toBeNull();
    expect(validateLevelOption('info')).toBeNull();
    expect(validateLevelOption('debug')).toBeNull();
    expect(validateLevelOption('trace')).toBeNull();
    expect(validateLevelOption('FATAL')).toBeNull();
    expect(validateLevelOption('Error')).toBeNull();
    expect(validateLevelOption('Warn')).toBeNull();
  });

  it('rejects invalid levels', () => {
    expect(validateLevelOption('invalid')).toBe(
      '--level must be one of: fatal, error, warn, info, debug, trace',
    );
    expect(validateLevelOption('warning')).toBe(
      '--level must be one of: fatal, error, warn, info, debug, trace',
    );
    expect(validateLevelOption('verbose')).toBe(
      '--level must be one of: fatal, error, warn, info, debug, trace',
    );
  });

  it('rejects empty string', () => {
    expect(validateLevelOption('')).toBe(
      '--level must be one of: fatal, error, warn, info, debug, trace',
    );
  });
});
