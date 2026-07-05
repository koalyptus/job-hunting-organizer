import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeHash, readToolhash, writeToolhash, toolhashPath } from '../toolhash.js';

vi.mock('../logger/logger.js', () => ({
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
  it('appends .toolhash to the file path', () => {
    expect(toolhashPath('/foo/bar/meta.md')).toBe('/foo/bar/meta.md.toolhash');
  });
});

describe('readToolhash', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-toolhash-read-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('returns stored hash when sidecar exists', async () => {
    const filePath = join(workDir, 'meta.md');
    const expectedHash = computeHash('content');
    await writeFile(toolhashPath(filePath), expectedHash + '\n', 'utf8');

    const result = await readToolhash(filePath);
    expect(result).toBe(expectedHash);
  });

  it('returns null when sidecar does not exist', async () => {
    const filePath = join(workDir, 'meta.md');
    const result = await readToolhash(filePath);
    expect(result).toBeNull();
  });

  it('returns null when sidecar is empty', async () => {
    const filePath = join(workDir, 'meta.md');
    await writeFile(toolhashPath(filePath), '', 'utf8');

    const result = await readToolhash(filePath);
    expect(result).toBeNull();
  });

  it('returns null when sidecar is whitespace-only', async () => {
    const filePath = join(workDir, 'meta.md');
    await writeFile(toolhashPath(filePath), '  \n  \n', 'utf8');

    const result = await readToolhash(filePath);
    expect(result).toBeNull();
  });

  it('trims whitespace from the stored hash', async () => {
    const filePath = join(workDir, 'meta.md');
    const hash = computeHash('test');
    await writeFile(toolhashPath(filePath), `  ${hash}  \n`, 'utf8');

    const result = await readToolhash(filePath);
    expect(result).toBe(hash);
  });
});

describe('writeToolhash', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-toolhash-write-'));
  });

  afterEach(async () => {
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
});

describe('round-trip: compute → write → read', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-toolhash-rt-'));
  });

  afterEach(async () => {
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
