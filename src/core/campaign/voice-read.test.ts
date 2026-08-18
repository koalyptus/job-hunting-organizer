import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { FileStore } from '../../storage/types.js';
import { createStore } from '../../storage/index.js';
import { resolveVoiceGuide, readCampaignVoiceGuide, readGlobalVoiceGuide } from './voice-read.js';

const CUR = 'test-campaign';

describe('voice-read', () => {
  let testDir: string;
  let store: FileStore;

  beforeEach(async () => {
    testDir = join(tmpdir(), `jho-voice-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    store = createStore(testDir);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('returns empty string when no voice file exists', async () => {
    const result = await resolveVoiceGuide(CUR, store);
    expect(result).toBe('');
  });

  it('reads campaign-specific my-voice.md from knowledge-base/', async () => {
    const kbDir = join(testDir, 'knowledge-base');
    await mkdir(kbDir, { recursive: true });
    await writeFile(join(kbDir, 'my-voice.md'), 'My voice content', 'utf8');

    const result = await resolveVoiceGuide(CUR, store);
    expect(result).toBe('My voice content');
  });

  it('prefers campaign-specific over global my-voice.md', async () => {
    const kbDir = join(testDir, 'knowledge-base');
    await mkdir(kbDir, { recursive: true });
    await writeFile(join(kbDir, 'my-voice.md'), 'Campaign voice', 'utf8');

    const dataRoot = join(testDir, 'global-data');
    await mkdir(dataRoot, { recursive: true });
    await writeFile(join(dataRoot, 'my-voice.md'), 'Global voice', 'utf8');

    const originalEnv = process.env['JHO_DATA'];
    process.env['JHO_DATA'] = dataRoot;

    try {
      const result = await resolveVoiceGuide(CUR, store);
      expect(result).toBe('Campaign voice');
    } finally {
      if (originalEnv !== undefined) {
        process.env['JHO_DATA'] = originalEnv;
      } else {
        delete process.env['JHO_DATA'];
      }
    }
  });

  it('falls back to global my-voice.md when campaign-specific is missing', async () => {
    const dataRoot = join(testDir, 'global-data');
    await mkdir(dataRoot, { recursive: true });
    await writeFile(join(dataRoot, 'my-voice.md'), 'Global voice', 'utf8');

    const originalEnv = process.env['JHO_DATA'];
    process.env['JHO_DATA'] = dataRoot;

    try {
      const result = await resolveVoiceGuide(CUR, store);
      expect(result).toBe('Global voice');
    } finally {
      if (originalEnv !== undefined) {
        process.env['JHO_DATA'] = originalEnv;
      } else {
        delete process.env['JHO_DATA'];
      }
    }
  });

  it('returns empty string when both campaign and global voice files are missing', async () => {
    const dataRoot = join(testDir, 'global-data');
    await mkdir(dataRoot, { recursive: true });

    const originalEnv = process.env['JHO_DATA'];
    process.env['JHO_DATA'] = dataRoot;

    try {
      const result = await resolveVoiceGuide(CUR, store);
      expect(result).toBe('');
    } finally {
      if (originalEnv !== undefined) {
        process.env['JHO_DATA'] = originalEnv;
      } else {
        delete process.env['JHO_DATA'];
      }
    }
  });

  it('propagates non-ENOENT read errors instead of falling back', async () => {
    const kbDir = join(testDir, 'knowledge-base');
    await mkdir(join(kbDir, 'my-voice.md'), { recursive: true });

    await expect(resolveVoiceGuide(CUR, store)).rejects.toThrow();
  });

  it('readCampaignVoiceGuide returns empty string when campaign file is absent', async () => {
    const result = await readCampaignVoiceGuide(CUR, store);
    expect(result).toBe('');
  });

  it('readCampaignVoiceGuide reads the campaign knowledge-base/my-voice.md', async () => {
    const kbDir = join(testDir, 'knowledge-base');
    await mkdir(kbDir, { recursive: true });
    await writeFile(join(kbDir, 'my-voice.md'), 'Campaign voice', 'utf8');

    const result = await readCampaignVoiceGuide(CUR, store);
    expect(result).toBe('Campaign voice');
  });

  it('readGlobalVoiceGuide returns empty string when global file is absent', async () => {
    const dataRoot = join(testDir, 'global-data');
    await mkdir(dataRoot, { recursive: true });

    const originalEnv = process.env['JHO_DATA'];
    process.env['JHO_DATA'] = dataRoot;

    try {
      const result = await readGlobalVoiceGuide();
      expect(result).toBe('');
    } finally {
      if (originalEnv !== undefined) {
        process.env['JHO_DATA'] = originalEnv;
      } else {
        delete process.env['JHO_DATA'];
      }
    }
  });

  it('readGlobalVoiceGuide reads the data-root my-voice.md', async () => {
    const dataRoot = join(testDir, 'global-data');
    await mkdir(dataRoot, { recursive: true });
    await writeFile(join(dataRoot, 'my-voice.md'), 'Global voice', 'utf8');

    const originalEnv = process.env['JHO_DATA'];
    process.env['JHO_DATA'] = dataRoot;

    try {
      const result = await readGlobalVoiceGuide();
      expect(result).toBe('Global voice');
    } finally {
      if (originalEnv !== undefined) {
        process.env['JHO_DATA'] = originalEnv;
      } else {
        delete process.env['JHO_DATA'];
      }
    }
  });
});
