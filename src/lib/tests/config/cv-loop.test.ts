import { describe, expect, it } from 'vitest';
import { setAtPath } from '../../../lib/config/config.view.js';

describe('setAtPath loop-body guard', () => {
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
