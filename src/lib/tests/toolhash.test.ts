import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import type * as FsPromisesModule from 'node:fs/promises';
import {
  chmod,
  mkdtemp,
  rm,
  readFile,
  writeFile,
  mkdir,
  rename,
  readdir,
  unlink,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  computeHash,
  readToolhash,
  writeToolhash,
  toolhashPath,
  legacyToolhashPath,
  migrateToolhashSidecar,
  removeLegacySidecar,
  hasLegacyToolhashSidecars,
  SIDECARS_DIR,
} from '../toolhash.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromisesModule>();
  return {
    ...actual,
    readFile: vi.fn(actual.readFile),
    writeFile: vi.fn(actual.writeFile),
    rename: vi.fn(actual.rename),
    readdir: vi.fn(actual.readdir),
    unlink: vi.fn(actual.unlink),
  };
});

vi.mock('../../lib/logger/logger.js', () => ({
  getRootLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    })),
  })),
  moduleLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  })),
}));

/**
 * Seed a sidecar at the new `.sidecars/` location, creating the directory
 * (production `writeToolhash` does this; direct `writeFile` here does not).
 */
async function seedSidecar(filePath: string, content: string): Promise<void> {
  const sidecar = toolhashPath(filePath);
  await mkdir(dirname(sidecar), { recursive: true });
  await writeFile(sidecar, content, 'utf8');
}

describe('computeHash', () => {
  it('returns consistent SHA-256 for the same content', () => {
    const content = 'hello world';
    const h1 = computeHash(content);
    const h2 = computeHash(content);
    expect(h1).toBe(h2);
  });

  it('returns different hashes for different content', () => {
    const h1 = computeHash('hello');
    const h2 = computeHash('world');
    expect(h1).not.toBe(h2);
  });

  it('returns a 64-character hex string', () => {
    const hash = computeHash('test');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the known SHA-256 of "hello world"', () => {
    // SHA-256 of "hello world" = b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
    const hash = computeHash('hello world');
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('hashes empty string', () => {
    const hash = computeHash('');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('toolhashPath', () => {
  it('places the sidecar in the .sidecars/ subdirectory beside the file', () => {
    const filePath = '/foo/bar/meta.md';
    const result = toolhashPath(filePath);
    expect(basename(result)).toBe(`${basename(filePath)}.toolhash`);
    expect(basename(dirname(result))).toBe(SIDECARS_DIR);
    expect(dirname(dirname(result))).toBe(dirname(filePath));
  });

  it('uses the SIDECARS_DIR constant for the subdirectory name', () => {
    expect(SIDECARS_DIR).toBe('.sidecars');
    const filePath = '/foo/bar/jd.md';
    const result = toolhashPath(filePath);
    expect(basename(result)).toBe(`${basename(filePath)}.toolhash`);
    expect(basename(dirname(result))).toBe(SIDECARS_DIR);
    expect(dirname(dirname(result))).toBe(dirname(filePath));
  });
});

describe('legacyToolhashPath', () => {
  it('appends .toolhash to the file path', () => {
    expect(legacyToolhashPath('/foo/bar/meta.md')).toBe('/foo/bar/meta.md.toolhash');
  });
});

describe('readToolhash', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-toolhash-read-'));
  });

  afterEach(async () => {
    await chmod(workDir, 0o755).catch(() => {});
    await rm(workDir, { recursive: true, force: true });
  });

  it('returns stored hash when sidecar exists in .sidecars/', async () => {
    const filePath = join(workDir, 'meta.md');
    const expectedHash = computeHash('content');
    await seedSidecar(filePath, expectedHash + '\n');

    const result = await readToolhash(filePath);
    expect(result).toBe(expectedHash);
  });

  it('returns null when sidecar does not exist', async () => {
    const filePath = join(workDir, 'meta.md');
    const result = await readToolhash(filePath);
    expect(result).toBeNull();
  });

  it('falls back to legacy sibling sidecar when .sidecars/ is absent', async () => {
    const filePath = join(workDir, 'meta.md');
    const legacy = legacyToolhashPath(filePath);
    const expectedHash = computeHash('legacy-content');
    await writeFile(legacy, expectedHash + '\n', 'utf8');

    const result = await readToolhash(filePath);
    expect(result).toBe(expectedHash);
  });

  it('prefers the .sidecars/ sidecar over the legacy sibling', async () => {
    const filePath = join(workDir, 'meta.md');
    await seedSidecar(filePath, computeHash('new-content') + '\n');
    await writeFile(legacyToolhashPath(filePath), computeHash('old-content') + '\n', 'utf8');

    const result = await readToolhash(filePath);
    expect(result).toBe(computeHash('new-content'));
  });

  it('legacy sidecar with empty content returns null', async () => {
    const filePath = join(workDir, 'meta.md');
    await writeFile(legacyToolhashPath(filePath), '', 'utf8');

    const result = await readToolhash(filePath);
    expect(result).toBeNull();
  });

  it('returns null when sidecar is empty', async () => {
    const filePath = join(workDir, 'meta.md');
    await seedSidecar(filePath, '');

    const result = await readToolhash(filePath);
    expect(result).toBeNull();
  });

  it('returns null when sidecar is whitespace-only', async () => {
    const filePath = join(workDir, 'meta.md');
    await seedSidecar(filePath, '  \n  \n');

    const result = await readToolhash(filePath);
    expect(result).toBeNull();
  });

  it('trims whitespace from the stored hash', async () => {
    const filePath = join(workDir, 'meta.md');
    const hash = computeHash('test');
    await seedSidecar(filePath, `  ${hash}  \n`);

    const result = await readToolhash(filePath);
    expect(result).toBe(hash);
  });

  it('returns null when sidecar read fails with non-ENOENT error', async () => {
    const filePath = join(workDir, 'meta.md');
    await seedSidecar(filePath, 'some content\n');
    vi.mocked(readFile).mockRejectedValueOnce(
      Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }),
    );

    const result = await readToolhash(filePath);
    expect(result).toBeNull();
  });
});

describe('writeToolhash', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-toolhash-write-'));
  });

  afterEach(async () => {
    await chmod(workDir, 0o755).catch(() => {});
    await rm(workDir, { recursive: true, force: true });
  });

  it('writes the hash to the sidecar file', async () => {
    const filePath = join(workDir, 'meta.md');
    const hash = computeHash('content');

    const result = await writeToolhash(filePath, hash);
    expect(result).toBe(true);

    const stored = await readFile(toolhashPath(filePath), 'utf8');
    expect(stored).toBe(hash + '\n');
  });

  it('creates parent directories if needed', async () => {
    const filePath = join(workDir, 'nested', 'dir', 'meta.md');
    const hash = computeHash('content');

    const result = await writeToolhash(filePath, hash);
    expect(result).toBe(true);

    const stored = await readFile(toolhashPath(filePath), 'utf8');
    expect(stored).toBe(hash + '\n');
  });

  it('overwrites existing sidecar', async () => {
    const filePath = join(workDir, 'meta.md');
    const hash1 = computeHash('old');
    const hash2 = computeHash('new');

    await writeToolhash(filePath, hash1);
    await writeToolhash(filePath, hash2);

    const stored = await readFile(toolhashPath(filePath), 'utf8');
    expect(stored).toBe(hash2 + '\n');
  });

  it('returns false when write fails', async () => {
    const filePath = join(workDir, 'meta.md');
    vi.mocked(writeFile).mockRejectedValueOnce(new Error('EACCES: permission denied'));

    const result = await writeToolhash(filePath, computeHash('test'));
    expect(result).toBe(false);
  });
});

describe('writeToolhash', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-toolhash-write-'));
  });

  afterEach(async () => {
    await chmod(workDir, 0o755).catch(() => {});
    await rm(workDir, { recursive: true, force: true });
  });

  it('writes the sidecar inside the .sidecars/ subdirectory', async () => {
    const filePath = join(workDir, 'meta.md');
    const hash = computeHash('content');

    const result = await writeToolhash(filePath, hash);
    expect(result).toBe(true);

    const stored = await readFile(toolhashPath(filePath), 'utf8');
    expect(stored).toBe(hash + '\n');
    expect(toolhashPath(filePath)).toBe(join(workDir, '.sidecars', 'meta.md.toolhash'));
  });

  it('creates parent directories if needed', async () => {
    const filePath = join(workDir, 'nested', 'dir', 'meta.md');
    const hash = computeHash('content');

    const result = await writeToolhash(filePath, hash);
    expect(result).toBe(true);

    const stored = await readFile(toolhashPath(filePath), 'utf8');
    expect(stored).toBe(hash + '\n');
  });

  it('does not write a sibling sidecar', async () => {
    const filePath = join(workDir, 'meta.md');
    await writeToolhash(filePath, computeHash('content'));
    expect(existsSync(legacyToolhashPath(filePath))).toBe(false);
  });

  it('overwrites existing sidecar', async () => {
    const filePath = join(workDir, 'meta.md');
    const hash1 = computeHash('old');
    const hash2 = computeHash('new');

    await writeToolhash(filePath, hash1);
    await writeToolhash(filePath, hash2);

    const stored = await readFile(toolhashPath(filePath), 'utf8');
    expect(stored).toBe(hash2 + '\n');
  });

  it('returns false when write fails', async () => {
    const filePath = join(workDir, 'meta.md');
    vi.mocked(writeFile).mockRejectedValueOnce(new Error('EACCES: permission denied'));

    const result = await writeToolhash(filePath, computeHash('test'));
    expect(result).toBe(false);
  });
});

describe('migrateToolhashSidecar', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-toolhash-mig-'));
  });

  afterEach(async () => {
    await chmod(workDir, 0o755).catch(() => {});
    await rm(workDir, { recursive: true, force: true });
  });

  it('moves a legacy sibling sidecar into .sidecars/', async () => {
    const filePath = join(workDir, 'meta.md');
    const hash = computeHash('content');
    await writeFile(legacyToolhashPath(filePath), hash + '\n', 'utf8');

    const migrated = await migrateToolhashSidecar(filePath);
    expect(migrated).toBe(true);
    expect(existsSync(legacyToolhashPath(filePath))).toBe(false);
    expect(await readFile(toolhashPath(filePath), 'utf8')).toBe(hash + '\n');
  });

  it('returns false when no legacy sidecar exists', async () => {
    const filePath = join(workDir, 'meta.md');
    expect(await migrateToolhashSidecar(filePath)).toBe(false);
  });

  it('removes the legacy sidecar when the new location already exists', async () => {
    const filePath = join(workDir, 'meta.md');
    const hash = computeHash('content');
    await seedSidecar(filePath, hash + '\n');
    await writeFile(legacyToolhashPath(filePath), 'stale\n', 'utf8');

    const migrated = await migrateToolhashSidecar(filePath);
    expect(migrated).toBe(false);
    expect(existsSync(legacyToolhashPath(filePath))).toBe(false);
    expect(await readFile(toolhashPath(filePath), 'utf8')).toBe(hash + '\n');
  });
});

describe('hasLegacyToolhashSidecars', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-toolhash-legacy-'));
  });

  afterEach(async () => {
    await chmod(workDir, 0o755).catch(() => {});
    await rm(workDir, { recursive: true, force: true });
  });

  it('detects a legacy sibling sidecar', async () => {
    await writeFile(join(workDir, 'meta.md.toolhash'), 'hash\n', 'utf8');
    expect(await hasLegacyToolhashSidecars(workDir)).toBe(true);
  });

  it('returns false when only .sidecars/ sidecars exist', async () => {
    await seedSidecar(join(workDir, 'meta.md'), 'hash\n');
    expect(await hasLegacyToolhashSidecars(workDir)).toBe(false);
  });

  it('returns false for an empty folder', async () => {
    expect(await hasLegacyToolhashSidecars(workDir)).toBe(false);
  });
});

describe('removeLegacySidecar', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-toolhash-rm-'));
  });

  afterEach(async () => {
    await chmod(workDir, 0o755).catch(() => {});
    await rm(workDir, { recursive: true, force: true });
  });

  it('removes the legacy sibling sidecar', async () => {
    const filePath = join(workDir, 'meta.md');
    await writeFile(legacyToolhashPath(filePath), 'hash\n', 'utf8');
    await removeLegacySidecar(filePath);
    expect(existsSync(legacyToolhashPath(filePath))).toBe(false);
  });

  it('is a no-op when no legacy sidecar exists', async () => {
    const filePath = join(workDir, 'meta.md');
    await expect(removeLegacySidecar(filePath)).resolves.toBeUndefined();
  });
});

describe('toolhash error edges', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-toolhash-edge-'));
  });

  afterEach(async () => {
    await chmod(workDir, 0o755).catch(() => {});
    await rm(workDir, { recursive: true, force: true });
  });

  it('readToolhash: legacy EACCES falls back to null (not thrown)', async () => {
    const filePath = join(workDir, 'meta.md');
    // New location absent (ENOENT), legacy read fails with a non-ENOENT error.
    vi.mocked(readFile)
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
      .mockRejectedValueOnce(Object.assign(new Error('EACCES'), { code: 'EACCES' }));

    const result = await readToolhash(filePath);
    expect(result).toBeNull();
  });

  it('migrateToolhashSidecar: logs and returns false on rename failure', async () => {
    const filePath = join(workDir, 'meta.md');
    await writeFile(legacyToolhashPath(filePath), computeHash('content') + '\n', 'utf8');
    vi.mocked(rename).mockRejectedValueOnce(new Error('EXDEV: cross-device link'));

    const migrated = await migrateToolhashSidecar(filePath);
    expect(migrated).toBe(false);
  });

  it('removeLegacySidecar: ignores non-ENOENT unlink errors', async () => {
    const filePath = join(workDir, 'meta.md');
    await writeFile(legacyToolhashPath(filePath), 'hash\n', 'utf8');
    vi.mocked(unlink).mockRejectedValueOnce(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }));

    await expect(removeLegacySidecar(filePath)).resolves.toBeUndefined();
  });

  it('hasLegacyToolhashSidecars: returns false when readdir fails', async () => {
    vi.mocked(readdir).mockRejectedValueOnce(new Error('EACCES: permission denied'));

    expect(await hasLegacyToolhashSidecars(workDir)).toBe(false);
  });
});

describe('round-trip: compute → write → read', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-toolhash-rt-'));
  });

  afterEach(async () => {
    await chmod(workDir, 0o755).catch(() => {});
    await rm(workDir, { recursive: true, force: true });
  });

  it('hash matches after write and read', async () => {
    const filePath = join(workDir, 'jd.md');
    const content = 'Some job description content.';
    const hash = computeHash(content);

    await writeToolhash(filePath, hash);
    const stored = await readToolhash(filePath);

    expect(stored).toBe(hash);
    expect(stored).toBe(computeHash(content));
  });

  it('detects content change after write', async () => {
    const filePath = join(workDir, 'jd.md');
    const content1 = 'Version 1';
    const content2 = 'Version 2';

    const hash1 = computeHash(content1);
    const hash2 = computeHash(content2);

    await writeToolhash(filePath, hash1);
    const stored = await readToolhash(filePath);
    expect(stored).toBe(hash1);

    // Content changed — new hash differs
    expect(hash2).not.toBe(hash1);
  });
});
