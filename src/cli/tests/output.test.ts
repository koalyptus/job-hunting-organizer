import { afterEach, describe, expect, it, vi } from 'vitest';
import { userError, userInfo, userSuccess } from '../output.js';

describe('userError', () => {
  const stderrSpy = vi.spyOn(process.stderr, 'write');

  afterEach(() => {
    stderrSpy.mockClear();
  });

  it('writes to stderr with ✖ error: prefix', () => {
    userError('something went wrong');
    expect(stderrSpy).toHaveBeenCalledWith('✖ error: something went wrong\n');
  });

  it('writes multiple messages', () => {
    userError('first');
    userError('second');
    expect(stderrSpy).toHaveBeenCalledTimes(2);
  });

  it('handles empty string', () => {
    userError('');
    expect(stderrSpy).toHaveBeenCalledWith('✖ error: \n');
  });

  it('does not write to stdout', () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write');
    userError('test');
    expect(stdoutSpy).not.toHaveBeenCalled();
    stdoutSpy.mockRestore();
  });
});

describe('userInfo', () => {
  const stderrSpy = vi.spyOn(process.stderr, 'write');

  afterEach(() => {
    stderrSpy.mockClear();
  });

  it('writes to stderr without prefix', () => {
    userInfo('campaign stats loaded');
    expect(stderrSpy).toHaveBeenCalledWith('campaign stats loaded\n');
  });

  it('handles empty string', () => {
    userInfo('');
    expect(stderrSpy).toHaveBeenCalledWith('\n');
  });

  it('does not write to stdout', () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write');
    userInfo('test');
    expect(stdoutSpy).not.toHaveBeenCalled();
    stdoutSpy.mockRestore();
  });
});

describe('userSuccess', () => {
  const stdoutSpy = vi.spyOn(process.stdout, 'write');

  afterEach(() => {
    stdoutSpy.mockClear();
  });

  it('writes to stdout without prefix', () => {
    userSuccess('campaign renamed successfully');
    expect(stdoutSpy).toHaveBeenCalledWith('campaign renamed successfully\n');
  });

  it('handles empty string', () => {
    userSuccess('');
    expect(stdoutSpy).toHaveBeenCalledWith('\n');
  });

  it('does not write to stderr', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write');
    userSuccess('test');
    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
  });
});
