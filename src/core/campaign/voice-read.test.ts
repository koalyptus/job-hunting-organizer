import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveVoiceGuide, readCampaignVoiceGuide, readGlobalVoiceGuide } from './voice-read.js';

describe('voice-read', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `jho-voice-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('returns empty string when no voice file exists', async () => {
    const result = await resolveVoiceGuide(testDir);
    expect(result).toBe('');
  });

  it('reads campaign-specific my-voice.md from knowledge-base/', async () => {
    const kbDir = join(testDir, 'knowledge-base');
    await mkdir(kbDir, { recursive: true });
    await writeFile(join(kbDir, 'my-voice.md'), 'My voice content', 'utf8');

    const result = await resolveVoiceGuide(testDir);
    expect(result).toBe('My voice content');
  });

  it('prefers campaign-specific over global my-voice.md', async () => {
    // Create campaign-specific voice file in knowledge-base/
    const kbDir = join(testDir, 'knowledge-base');
    await mkdir(kbDir, { recursive: true });
    await writeFile(join(kbDir, 'my-voice.md'), 'Campaign voice', 'utf8');

    // Create global voice file in data root
    const dataRoot = join(testDir, 'global-data');
    await mkdir(dataRoot, { recursive: true });
    await writeFile(join(dataRoot, 'my-voice.md'), 'Global voice', 'utf8');

    // Set JHO_DATA env var to point to our test data root
    const originalEnv = process.env['JHO_DATA'];
    process.env['JHO_DATA'] = dataRoot;

    try {
      const result = await resolveVoiceGuide(testDir);
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
    // Create global voice file in data root
    const dataRoot = join(testDir, 'global-data');
    await mkdir(dataRoot, { recursive: true });
    await writeFile(join(dataRoot, 'my-voice.md'), 'Global voice', 'utf8');

    // Set JHO_DATA env var to point to our test data root
    const originalEnv = process.env['JHO_DATA'];
    process.env['JHO_DATA'] = dataRoot;

    try {
      const result = await resolveVoiceGuide(testDir);
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
    // Create data root but no voice file
    const dataRoot = join(testDir, 'global-data');
    await mkdir(dataRoot, { recursive: true });

    const originalEnv = process.env['JHO_DATA'];
    process.env['JHO_DATA'] = dataRoot;

    try {
      const result = await resolveVoiceGuide(testDir);
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
    // A directory named my-voice.md makes readFile throw EISDIR — a real
    // I/O error that must surface, not silently fall back to the global file.
    const kbDir = join(testDir, 'knowledge-base');
    await mkdir(join(kbDir, 'my-voice.md'), { recursive: true });

    await expect(resolveVoiceGuide(testDir)).rejects.toThrow();
  });

  it('readCampaignVoiceGuide returns empty string when campaign file is absent', async () => {
    const result = await readCampaignVoiceGuide(testDir);
    expect(result).toBe('');
  });

  it('readCampaignVoiceGuide reads the campaign knowledge-base/my-voice.md', async () => {
    const kbDir = join(testDir, 'knowledge-base');
    await mkdir(kbDir, { recursive: true });
    await writeFile(join(kbDir, 'my-voice.md'), 'Campaign voice', 'utf8');

    const result = await readCampaignVoiceGuide(testDir);
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
