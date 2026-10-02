import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { atomicWrite, pathExists, withBackup } from '../fs.js';

describe('pathExists', () => {
  let workDir: string;
  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-fs-'));
  });
  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('returns true for existing files', async () => {
    const file = join(workDir, 'exists.txt');
    await writeFile(file, 'x');
    expect(await pathExists(file)).toBe(true);
  });

  it('returns false for missing files', async () => {
    expect(await pathExists(join(workDir, 'missing.txt'))).toBe(false);
  });

  it('returns false when an intermediate directory is missing', async () => {
    expect(await pathExists(join(workDir, 'no', 'such', 'file.txt'))).toBe(false);
  });
});

describe('atomicWrite', () => {
  let workDir: string;
  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-fs-'));
  });
  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('returns true on success', async () => {
    const target = join(workDir, 'file.txt');
    const result = await atomicWrite(target, 'hello');
    expect(result).toBe(true);
  });

  it('creates parent directories by default', async () => {
    const target = join(workDir, 'deep', 'nested', 'file.txt');
    await atomicWrite(target, 'hello');
    expect(await readFile(target, 'utf8')).toBe('hello');
  });

  it('overwrites existing content', async () => {
    const target = join(workDir, 'file.txt');
    await atomicWrite(target, 'first');
    await atomicWrite(target, 'second');
    expect(await readFile(target, 'utf8')).toBe('second');
  });

  it('writes binary content', async () => {
    const target = join(workDir, 'blob.bin');
    const buf = new Uint8Array([0, 1, 2, 255]);
    await atomicWrite(target, buf);
    const onDisk = await readFile(target);
    expect(Array.from(onDisk)).toEqual([0, 1, 2, 255]);
  });

  it('does not leave tmp files behind on success', async () => {
    const target = join(workDir, 'clean.txt');
    await atomicWrite(target, 'ok');
    const files = await readdir(workDir);
    expect(files).toEqual(['clean.txt']);
  });

  it('returns false when ensureDir is false and parent missing', async () => {
    const target = join(workDir, 'no-such-dir', 'file.txt');
    const result = await atomicWrite(target, 'x', { ensureDir: false });
    expect(result).toBe(false);
  });

  it('returns false when writing to an invalid path', async () => {
    const blocker = join(workDir, 'blocker');
    await writeFile(blocker, 'x');
    const result = await atomicWrite(join(blocker, 'child', 'file.txt'), 'x');
    expect(result).toBe(false);
  });
});

describe('withBackup', () => {
  let workDir: string;
  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-fs-'));
  });
  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('returns the function result on success', async () => {
    const target = join(workDir, 'f.txt');
    await writeFile(target, 'before');
    const result = await withBackup(target, async () => 'ok');
    expect(result).toBe('ok');
  });

  it('removes the backup on success', async () => {
    const target = join(workDir, 'f.txt');
    await writeFile(target, 'before');
    await withBackup(target, async () => {
      await writeFile(target, 'after');
    });
    const files = await readdir(workDir);
    expect(files).toEqual(['f.txt']);
  });

  it('restores from backup on failure', async () => {
    const target = join(workDir, 'f.txt');
    await writeFile(target, 'before');
    await expect(
      withBackup(target, async () => {
        await writeFile(target, 'after');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await readFile(target, 'utf8')).toBe('before');
  });

  it('works on a file that does not exist (no backup, no restore)', async () => {
    const target = join(workDir, 'new.txt');
    const result = await withBackup(target, async () => 42);
    expect(result).toBe(42);
  });

  it('rethrows without restoring when the file never existed', async () => {
    const target = join(workDir, 'never-there.txt');
    await expect(
      withBackup(target, async () => {
        throw new Error('fn boom');
      }),
    ).rejects.toThrow('fn boom');
  });

  it('resolves relative paths against cwd', async () => {
    const origCwd = process.cwd();
    process.chdir(workDir);
    try {
      expect(await atomicWrite('rel-file.txt', 'hello-relative')).toBe(true);
      expect(await readFile(join(workDir, 'rel-file.txt'), 'utf8')).toBe('hello-relative');
    } finally {
      process.chdir(origCwd);
    }
  });

  it('honours custom encoding and mode', async () => {
    const target = join(workDir, 'enc.txt');
    expect(await atomicWrite(target, 'hi', { encoding: 'utf8', mode: 0o600 })).toBe(true);
    expect(await readFile(target, 'utf8')).toBe('hi');
    if (process.platform !== 'win32') {
      const { mode } = await stat(target);
      expect(mode & 0o777).toBe(0o600);
    }
  });
});
