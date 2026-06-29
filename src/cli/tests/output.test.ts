import { afterEach, describe, expect, it, vi } from 'vitest';
import { userError, userWarn, userInfo, userSuccess, userOutput } from '../output.js';

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

describe('userWarn', () => {
  const stderrSpy = vi.spyOn(process.stderr, 'write');

  afterEach(() => {
    stderrSpy.mockClear();
  });

  it('writes to stderr with ⚠ prefix', () => {
    userWarn('not implemented yet');
    expect(stderrSpy).toHaveBeenCalledWith('⚠ not implemented yet\n');
  });

  it('handles empty string', () => {
    userWarn('');
    expect(stderrSpy).toHaveBeenCalledWith('⚠ \n');
  });

  it('does not write to stdout', () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write');
    userWarn('test');
    expect(stdoutSpy).not.toHaveBeenCalled();
    stdoutSpy.mockRestore();
  });
});

describe('userInfo', () => {
  const stdoutSpy = vi.spyOn(process.stdout, 'write');

  afterEach(() => {
    stdoutSpy.mockClear();
  });

  it('writes to stdout with ℹ prefix', () => {
    userInfo('campaign stats loaded');
    expect(stdoutSpy).toHaveBeenCalledWith('ℹ campaign stats loaded\n');
  });

  it('handles empty string', () => {
    userInfo('');
    expect(stdoutSpy).toHaveBeenCalledWith('ℹ \n');
  });

  it('does not write to stderr', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write');
    userInfo('test');
    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
  });
});

describe('userSuccess', () => {
  const stdoutSpy = vi.spyOn(process.stdout, 'write');

  afterEach(() => {
    stdoutSpy.mockClear();
  });

  it('writes to stdout with ✔ prefix', () => {
    userSuccess('campaign renamed successfully');
    expect(stdoutSpy).toHaveBeenCalledWith('✔ campaign renamed successfully\n');
  });

  it('handles empty string', () => {
    userSuccess('');
    expect(stdoutSpy).toHaveBeenCalledWith('✔ \n');
  });

  it('does not write to stderr', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write');
    userSuccess('test');
    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
  });
});

describe('userOutput', () => {
  const stdoutSpy = vi.spyOn(process.stdout, 'write');

  afterEach(() => {
    stdoutSpy.mockClear();
  });

  it('writes to stdout without prefix', () => {
    userOutput('campaign renamed successfully');
    expect(stdoutSpy).toHaveBeenCalledWith('campaign renamed successfully\n');
  });

  it('handles empty string', () => {
    userOutput('');
    expect(stdoutSpy).toHaveBeenCalledWith('\n');
  });

  it('does not write to stderr', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write');
    userOutput('test');
    expect(stderrSpy).not.toHaveBeenCalled();
    stderrSpy.mockRestore();
  });
});
