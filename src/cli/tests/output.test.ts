import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userError, userWarn, userInfo, userSuccess, userOutput } from '../output.js';

// Spies are created per test and restored afterwards.
//
// They must NOT be created once at collection time: since Vitest 3, `vi.spyOn`
// reuses an already-mocked method instead of assigning a new spy, and
// `mockRestore()` unwinds to the ORIGINAL function. A restore in one test would
// therefore tear down a spy that later tests still depend on.
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdoutSpy = vi.spyOn(process.stdout, 'write');
  stderrSpy = vi.spyOn(process.stderr, 'write');
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

describe('userError', () => {
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
    userError('test');
    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});

describe('userWarn', () => {
  it('writes to stderr with ⚠ prefix', () => {
    userWarn('not implemented yet');
    expect(stderrSpy).toHaveBeenCalledWith('⚠ not implemented yet\n');
  });

  it('handles empty string', () => {
    userWarn('');
    expect(stderrSpy).toHaveBeenCalledWith('⚠ \n');
  });

  it('does not write to stdout', () => {
    userWarn('test');
    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});

describe('userInfo', () => {
  it('writes to stdout with ℹ prefix', () => {
    userInfo('campaign stats loaded');
    expect(stdoutSpy).toHaveBeenCalledWith('ℹ campaign stats loaded\n');
  });

  it('handles empty string', () => {
    userInfo('');
    expect(stdoutSpy).toHaveBeenCalledWith('ℹ \n');
  });

  it('does not write to stderr', () => {
    userInfo('test');
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});

describe('userSuccess', () => {
  it('writes to stdout with ✔ prefix', () => {
    userSuccess('campaign renamed successfully');
    expect(stdoutSpy).toHaveBeenCalledWith('✔ campaign renamed successfully\n');
  });

  it('handles empty string', () => {
    userSuccess('');
    expect(stdoutSpy).toHaveBeenCalledWith('✔ \n');
  });

  it('does not write to stderr', () => {
    userSuccess('test');
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});

describe('userOutput', () => {
  it('writes to stdout without prefix', () => {
    userOutput('campaign renamed successfully');
    expect(stdoutSpy).toHaveBeenCalledWith('campaign renamed successfully\n');
  });

  it('handles empty string', () => {
    userOutput('');
    expect(stdoutSpy).toHaveBeenCalledWith('\n');
  });

  it('does not write to stderr', () => {
    userOutput('test');
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
