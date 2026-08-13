import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, symlink, mkdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeFs } from '@file-services/node';
import { toAbsolute, forbidRootTarget, canonicalizeRoot } from '../local/path-guard.js';
import type { IFileSystem } from '@file-services/types';

const fs: IFileSystem = createNodeFs();

describe('path-guard: toAbsolute', () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'jho-guard-'));
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('resolves a relative path under the root', () => {
    expect(toAbsolute(fs, root, 'a/b.txt')).toBe(join(root, 'a/b.txt'));
  });

  it('treats empty / "." as the root itself', () => {
    expect(toAbsolute(fs, root, '')).toBe(root);
    expect(toAbsolute(fs, root, '.')).toBe(root);
  });

  it('resolves nested relative paths', () => {
    expect(toAbsolute(fs, root, 'deep/nested/file.txt')).toBe(join(root, 'deep/nested/file.txt'));
  });

  it('rejects absolute paths', () => {
    expect(() => toAbsolute(fs, root, '/etc/passwd')).toThrow(/relative/);
  });

  it('rejects ".." segments', () => {
    expect(() => toAbsolute(fs, root, '../escape.txt')).toThrow(/relative|escapes/);
    expect(() => toAbsolute(fs, root, 'a/../../etc')).toThrow(/escapes/);
  });

  it('rejects Windows drive letters', () => {
    expect(() => toAbsolute(fs, root, 'C:/windows.txt')).toThrow(/drive letters/);
    expect(() => toAbsolute(fs, root, 'c:boot.ini')).toThrow(/drive letters/);
  });

  it('rejects a path that escapes via a symlink inside the root', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'jho-outside-'));
    const link = join(root, 'escape-link');
    await symlink(outside, link, 'dir');
    try {
      expect(() => toAbsolute(fs, root, 'escape-link/secret.txt')).toThrow(
        /escapes data root via symlink/,
      );
    } finally {
      await rm(link, { force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('rejects a path whose parent symlink escapes the root', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'jho-outside-'));
    const link = join(root, 'parent-link');
    await symlink(outside, link, 'dir');
    try {
      expect(() => toAbsolute(fs, root, 'parent-link/secret.txt')).toThrow(
        /escapes data root via symlink/,
      );
    } finally {
      await rm(link, { force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('accepts a normal path whose ancestor is a real (non-escaping) directory', async () => {
    const deep = join(root, 'real', 'nested');
    await mkdir(deep, { recursive: true });
    expect(toAbsolute(fs, root, 'real/nested/file.txt')).toBe(join(root, 'real/nested/file.txt'));
  });

  it('does not flag a file used as a directory (ENOTDIR) as an escape', () => {
    // "f.txt/child" — f.txt is a file. The walk-up must not throw "escapes".
    expect(() => toAbsolute(fs, root, 'f.txt/child')).not.toThrow(/escapes/);
  });

  it('resolves against the declared root even when it is a symlink (macOS /tmp, Windows 8.3)', async () => {
    // CI runners spell the temp root differently from its canonical form
    // (macOS /var/folders -> /private/var/folders; Windows RUNNER~1 -> runneradmin).
    // toAbsolute resolves against the declared root, so the result keeps that
    // spelling — it must not be compared against the canonical path.
    const real = await mkdtemp(join(tmpdir(), 'jho-real-'));
    const link = await mkdtemp(join(tmpdir(), 'jho-link-'));
    await rm(link, { recursive: true, force: true });
    await symlink(real, link, 'dir');
    try {
      expect(toAbsolute(fs, link, 'a/b.txt')).toBe(join(link, 'a/b.txt'));
    } finally {
      await rm(real, { recursive: true, force: true });
      await rm(link, { recursive: true, force: true });
    }
  });
});

describe('path-guard: canonicalizeRoot', () => {
  it('returns the canonical (realpath) form when the root is a symlink', async () => {
    const real = await mkdtemp(join(tmpdir(), 'jho-real-'));
    const link = await mkdtemp(join(tmpdir(), 'jho-link-'));
    await rm(link, { recursive: true, force: true });
    await symlink(real, link, 'dir');
    try {
      expect(canonicalizeRoot(fs, link)).toBe(await realpath(real));
    } finally {
      await rm(real, { recursive: true, force: true });
      await rm(link, { recursive: true, force: true });
    }
  });

  it('returns the root unchanged when it does not exist (realpath throws)', async () => {
    const missing = join(tmpdir(), `jho-missing-${Date.now()}`);
    expect(canonicalizeRoot(fs, missing)).toBe(missing);
  });
});

describe('path-guard: forbidRootTarget', () => {
  let root: string;
  let canonicalRoot: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'jho-guard-'));
    canonicalRoot = await realpath(root);
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('rejects the declared root', () => {
    expect(() => forbidRootTarget('', root, root, canonicalRoot)).toThrow(
      /must not target the data root/,
    );
    expect(() => forbidRootTarget('.', root, root, canonicalRoot)).toThrow(
      /must not target the data root/,
    );
  });

  it('rejects the canonical root (symlinked root spelled differently)', async () => {
    const real = await mkdtemp(join(tmpdir(), 'jho-real-'));
    const link = await mkdtemp(join(tmpdir(), 'jho-link-'));
    await rm(link, { recursive: true, force: true });
    await symlink(real, link, 'dir');
    try {
      // declared = symlink, canonical = real; both must be rejected
      const canonical = await realpath(real);
      expect(() => forbidRootTarget('', link, link, canonical)).toThrow(
        /must not target the data root/,
      );
    } finally {
      await rm(real, { recursive: true, force: true });
      await rm(link, { recursive: true, force: true });
    }
  });

  it('allows a normal child path', () => {
    expect(() =>
      forbidRootTarget('a/b.txt', join(canonicalRoot, 'a/b.txt'), root, canonicalRoot),
    ).not.toThrow();
  });

  it('allows a deeper path equal to root + segment', () => {
    expect(() =>
      forbidRootTarget('x', join(canonicalRoot, 'x'), root, canonicalRoot),
    ).not.toThrow();
  });
});
