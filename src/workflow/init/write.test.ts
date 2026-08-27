/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/consistent-type-imports */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';

vi.mock('@clack/prompts', () => ({
  log: { info: vi.fn(), warn: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

const mockIngest = vi.fn();
vi.mock('../../workflow/campaign/kb-ingest.js', () => ({
  ingestKnowledgeBase: (...args: unknown[]) => mockIngest(...args),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    writeFile: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  };
});

describe('workflow/init/write branch coverage', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'jho-write2-'));
    mockIngest.mockReset();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('ingestKnowledgeBase returns empty when no kbPath (92)', async () => {
    const { ingestKnowledgeBase } = await import('./write.js');
    const result = await ingestKnowledgeBase(tmpRoot, undefined, join(tmpRoot, 'kb'));
    expect(result).toEqual([]);
    expect(mockIngest).not.toHaveBeenCalled();
  });

  it('ingestKnowledgeBase logs info when copied >0 (95-96)', async () => {
    mockIngest.mockResolvedValue(['a.pdf', 'b.md']);
    const { ingestKnowledgeBase } = await import('./write.js');
    const clack = await import('@clack/prompts');
    const result = await ingestKnowledgeBase(tmpRoot, 'some/path', join(tmpRoot, 'kb'));
    expect(result.length).toBe(1);
    expect(clack.log.info).toHaveBeenCalled();
  });

  it('ingestKnowledgeBase logs warn when copied ==0 (98-99)', async () => {
    mockIngest.mockResolvedValue([]);
    const { ingestKnowledgeBase } = await import('./write.js');
    const clack = await import('@clack/prompts');
    const result = await ingestKnowledgeBase(tmpRoot, 'some/path', join(tmpRoot, 'kb'));
    expect(result).toEqual([]);
    expect(clack.log.warn).toHaveBeenCalled();
  });

  it('scaffoldVoiceGuide early return when exists (109-110)', async () => {
    const fs = await import('../../lib/fs.js');
    vi.spyOn(fs, 'pathExists').mockResolvedValue(true);
    const { scaffoldVoiceGuide } = await import('./write.js');
    await scaffoldVoiceGuide(tmpRoot);
    // should not call writeFile
    const fsp = await import('node:fs/promises');
    expect(vi.mocked(fsp.writeFile)).not.toHaveBeenCalled();
  });

  it('scaffoldVoiceGuide fail-soft when writeFile throws (117-120)', async () => {
    const fs = await import('../../lib/fs.js');
    vi.spyOn(fs, 'pathExists').mockResolvedValue(false);
    const fsp = await import('node:fs/promises');
    vi.mocked(fsp.writeFile).mockRejectedValue(new Error('EACCES'));
    const { scaffoldVoiceGuide } = await import('./write.js');
    const clack = await import('@clack/prompts');
    await scaffoldVoiceGuide(tmpRoot);
    expect(clack.log.warn).toHaveBeenCalled();
  });
});
