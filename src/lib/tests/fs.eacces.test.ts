import { describe, it, expect, vi } from 'vitest';
import type * as FsPromisesModule from 'node:fs/promises';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromisesModule>();
  return {
    ...actual,
    stat: vi.fn(actual.stat),
  };
});

import { stat } from 'node:fs/promises';
import { pathExists } from '../fs.js';

describe('pathExists EACCES rethrow', () => {
  it('rethrows on EACCES', async () => {
    const err = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    vi.mocked(stat).mockRejectedValueOnce(err);
    await expect(pathExists('/some/restricted')).rejects.toMatchObject({ code: 'EACCES' });
  });

  it('rethrows on EPERM', async () => {
    const err = Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
    vi.mocked(stat).mockRejectedValueOnce(err);
    await expect(pathExists('/some/restricted')).rejects.toMatchObject({ code: 'EPERM' });
  });

  it('rethrows on generic error without ENOENT/ENOTDIR', async () => {
    const err = Object.assign(new Error('EIO: i/o error'), { code: 'EIO' });
    vi.mocked(stat).mockRejectedValueOnce(err);
    await expect(pathExists('/some/path')).rejects.toMatchObject({ code: 'EIO' });
  });

  it('rethrows when code is undefined', async () => {
    const err = new Error('unknown');
    vi.mocked(stat).mockRejectedValueOnce(err);
    await expect(pathExists('/some/path')).rejects.toThrow('unknown');
  });
});
