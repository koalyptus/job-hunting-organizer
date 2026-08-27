/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/consistent-type-imports */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import * as writeModule from './write.js';
import * as kbContextModule from '../../workflow/campaign/kb-context.js';
import * as cvModule from '../../lib/cv.js';
import * as fsLib from '../../lib/fs.js';
import * as fspModule from 'node:fs/promises';
import * as clackPrompts from '@clack/prompts';

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
    
    const result = await writeModule.ingestKnowledgeBase(tmpRoot, undefined, join(tmpRoot, 'kb'));
    expect(result).toEqual([]);
    expect(mockIngest).not.toHaveBeenCalled();
  });

  it('ingestKnowledgeBase logs info when copied >0 (95-96)', async () => {
    mockIngest.mockResolvedValue(['a.pdf', 'b.md']);
    
    const result = await writeModule.ingestKnowledgeBase(tmpRoot, 'some/path', join(tmpRoot, 'kb'));
    expect(result.length).toBe(1);
    expect(clackPrompts.log.info).toHaveBeenCalled();
  });

  it('ingestKnowledgeBase logs warn when copied ==0 (98-99)', async () => {
    mockIngest.mockResolvedValue([]);
    
    const result = await writeModule.ingestKnowledgeBase(tmpRoot, 'some/path', join(tmpRoot, 'kb'));
    expect(result).toEqual([]);
    expect(clackPrompts.log.warn).toHaveBeenCalled();
  });

  it('scaffoldVoiceGuide early return when exists (109-110)', async () => {
    
    vi.spyOn(fsLib, 'pathExists').mockResolvedValue(true);
    
    await writeModule.scaffoldVoiceGuide(tmpRoot);
    // should not call writeFile
    
    expect(vi.mocked(fspModule.writeFile)).not.toHaveBeenCalled();
  });

  it('scaffoldVoiceGuide fail-soft when writeFile throws (117-120)', async () => {
    
    vi.spyOn(fsLib, 'pathExists').mockResolvedValue(false);
    
    vi.mocked(fspModule.writeFile).mockRejectedValue(new Error('EACCES'));
    
    await writeModule.scaffoldVoiceGuide(tmpRoot);
    expect(clackPrompts.log.warn).toHaveBeenCalled();
  });
});
