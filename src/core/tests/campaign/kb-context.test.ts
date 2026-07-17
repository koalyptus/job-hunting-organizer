import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadKnowledgeBaseContext } from '../../campaign/kb-context.js';
import { CvError } from '../../cv.js';

vi.mock('../../cv.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    readCv: vi.fn(),
  };
});

const readCvMock = vi.mocked((await import('../../cv.js')).readCv);

// The module logs via moduleLogger(import.meta.url); spy on it so we can
// assert on pino `warn` calls (the test in question checks kb.truncated).
// vi.hoisted lifts the spy above the hoisted vi.mock factory.
const { warnSpy } = vi.hoisted(() => ({ warnSpy: vi.fn() }));
vi.mock('../../logger/logger.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    moduleLogger: vi.fn(() => ({ warn: warnSpy, info: vi.fn() }) as unknown),
  };
});

describe('loadKnowledgeBaseContext', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(`${tmpdir()}/jho-kb-`);
    readCvMock.mockReset();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns empty string when knowledge-base dir is absent', async () => {
    expect(await loadKnowledgeBaseContext(root)).toBe('');
    expect(readCvMock).not.toHaveBeenCalled();
  });

  it('returns empty string when folder has no readable docs', async () => {
    const kbDir = join(root, 'knowledge-base');
    await mkdir(kbDir, { recursive: true });
    await writeFile(join(kbDir, 'notes.json'), '{"x":1}');
    await mkdir(join(kbDir, 'github'), { recursive: true });
    await writeFile(join(kbDir, 'github', 'user.json'), '{"login":"x"}');

    expect(await loadKnowledgeBaseContext(root)).toBe('');
    expect(readCvMock).not.toHaveBeenCalled();
  });

  it('reads compatible docs and skips unknown extensions', async () => {
    const kbDir = join(root, 'knowledge-base');
    await mkdir(kbDir, { recursive: true });
    await writeFile(join(kbDir, 'tips.md'), '# tips');
    await writeFile(join(kbDir, 'ignore.bin'), 'binary');
    await writeFile(join(kbDir, 'also.csv'), 'a,b');

    readCvMock.mockImplementation(async (p: string) => ({
      text: `TEXT:${p}`,
      format: 'text',
      fileName: 'x',
    }));

    const result = await loadKnowledgeBaseContext(root);

    expect(result).toContain('## Knowledge base: tips.md');
    expect(result).toContain('TEXT:');
    expect(result).not.toContain('ignore.bin');
    expect(result).not.toContain('also.csv');
    expect(readCvMock).toHaveBeenCalledTimes(1);
  });

  it('walks nested folders', async () => {
    const kbDir = join(root, 'knowledge-base');
    await mkdir(join(kbDir, 'sub'), { recursive: true });
    await writeFile(join(kbDir, 'sub', 'deep.md'), 'deep');

    readCvMock.mockImplementation(async (_p: string) => ({
      text: 'X',
      format: 'text',
      fileName: 'x',
    }));

    const result = await loadKnowledgeBaseContext(root);
    expect(result).toContain('## Knowledge base: sub/deep.md');
  });

  it('skips github/ and json caches even nested', async () => {
    const kbDir = join(root, 'knowledge-base');
    await mkdir(join(kbDir, 'github'), { recursive: true });
    await writeFile(join(kbDir, 'github', 'user.json'), '{}');
    await writeFile(join(kbDir, 'a.md'), 'a');

    readCvMock.mockImplementation(async () => ({ text: 'A', format: 'text', fileName: 'x' }));

    const result = await loadKnowledgeBaseContext(root);
    expect(result).toContain('a.md');
    expect(readCvMock).toHaveBeenCalledTimes(1);
  });

  it('logs and skips on parse error (never throws)', async () => {
    const kbDir = join(root, 'knowledge-base');
    await mkdir(kbDir, { recursive: true });
    await writeFile(join(kbDir, 'bad.pdf'), '%PDF');

    readCvMock.mockRejectedValueOnce(new CvError('boom', 'parse_error'));

    const result = await loadKnowledgeBaseContext(root);
    expect(result).toBe('');
  });

  it('respects maxChars with oldest-first truncation + warning', async () => {
    const kbDir = join(root, 'knowledge-base');
    await mkdir(kbDir, { recursive: true });
    await writeFile(join(kbDir, 'a.md'), 'AAAA');
    await writeFile(join(kbDir, 'b.md'), 'BBBB');

    readCvMock.mockImplementation(async (p: string) => ({
      text: p.endsWith('a.md') ? 'AAAA' : 'BBBB',
      format: 'text',
      fileName: 'x',
    }));

    warnSpy.mockClear();
    const tooSmall = 12; // "## Knowledge base: a.md\n\nAAAA\n\n" > 12, so a is truncated
    const result = await loadKnowledgeBaseContext(root, { maxChars: tooSmall });
    expect(result.length).toBeLessThanOrEqual(tooSmall);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ maxChars: tooSmall }),
      'kb.truncated',
    );
  });

  it('returns full content when under maxChars', async () => {
    const kbDir = join(root, 'knowledge-base');
    await mkdir(kbDir, { recursive: true });
    await writeFile(join(kbDir, 'a.md'), 'AAAA');

    readCvMock.mockImplementation(async () => ({ text: 'AAAA', format: 'text', fileName: 'x' }));

    const result = await loadKnowledgeBaseContext(root, { maxChars: 10000 });
    expect(result).toContain('AAAA');
  });
});
