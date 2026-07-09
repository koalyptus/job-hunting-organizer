import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateIcsFile } from '../interview-ics.js';

vi.mock('ics', () => ({
  createEvent: vi.fn(),
}));

describe('generateIcsFile', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'jho-ics-'));
    const { createEvent } = await import('ics');
    vi.mocked(createEvent).mockReturnValue({
      error: null,
      value: 'BEGIN:VCALENDAR\nEND:VCALENDAR',
    });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('creates ICS file with correct filename format', async () => {
    const appFolder = join(testDir, 'app');
    await mkdir(appFolder, { recursive: true });

    const filePath = await generateIcsFile(appFolder, 1, '2026-07-15 10:00', 'technical', 60);

    expect(filePath).toBe(join(appFolder, 'interview-1-2026-07-15-10-00-technical.ics'));

    const content = await readFile(filePath, 'utf8');
    expect(content).toBe('BEGIN:VCALENDAR\nEND:VCALENDAR');
  });

  it('uses default title when not provided', async () => {
    const appFolder = join(testDir, 'app');
    await mkdir(appFolder, { recursive: true });

    await generateIcsFile(appFolder, 3, '2026-07-15 14:00', 'hr', 45);

    const { createEvent } = await import('ics');
    expect(vi.mocked(createEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Interview #3 (hr)',
      }),
    );
  });

  it('uses custom title when provided', async () => {
    const appFolder = join(testDir, 'app');
    await mkdir(appFolder, { recursive: true });

    await generateIcsFile(appFolder, 1, '2026-07-15 10:00', 'technical', 60, 'System Design Round');

    const { createEvent } = await import('ics');
    expect(vi.mocked(createEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'System Design Round',
      }),
    );
  });

  it('includes location when provided', async () => {
    const appFolder = join(testDir, 'app');
    await mkdir(appFolder, { recursive: true });

    await generateIcsFile(
      appFolder,
      1,
      '2026-07-15 10:00',
      'technical',
      60,
      undefined,
      'Google Meet',
    );

    const { createEvent } = await import('ics');
    expect(vi.mocked(createEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        location: 'Google Meet',
      }),
    );
  });

  it('omits location when not provided', async () => {
    const appFolder = join(testDir, 'app');
    await mkdir(appFolder, { recursive: true });

    await generateIcsFile(appFolder, 1, '2026-07-15 10:00', 'technical', 60);

    const { createEvent } = await import('ics');
    expect(vi.mocked(createEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        location: undefined,
      }),
    );
  });

  it('slugs type with spaces', async () => {
    const appFolder = join(testDir, 'app');
    await mkdir(appFolder, { recursive: true });

    const filePath = await generateIcsFile(appFolder, 1, '2026-07-15 10:00', 'system design', 60);

    expect(filePath).toContain('system-design');
  });

  it('throws when createEvent returns error', async () => {
    const { createEvent } = await import('ics');
    vi.mocked(createEvent).mockReturnValue({ error: new Error('bad event'), value: null });

    const appFolder = join(testDir, 'app');
    await mkdir(appFolder, { recursive: true });

    await expect(
      generateIcsFile(appFolder, 1, '2026-07-15 10:00', 'technical', 60),
    ).rejects.toThrow('Failed to create ICS event: Error: bad event');
  });

  it('throws when createEvent returns no value', async () => {
    const { createEvent } = await import('ics');
    vi.mocked(createEvent).mockReturnValue({ error: null, value: null });

    const appFolder = join(testDir, 'app');
    await mkdir(appFolder, { recursive: true });

    await expect(
      generateIcsFile(appFolder, 1, '2026-07-15 10:00', 'technical', 60),
    ).rejects.toThrow('Failed to create ICS event: no value returned');
  });

  it('parses datetime with seconds', async () => {
    const appFolder = join(testDir, 'app');
    await mkdir(appFolder, { recursive: true });

    const filePath = await generateIcsFile(appFolder, 1, '2026-07-15 10:30:45', 'technical', 60);

    expect(filePath).toBe(join(appFolder, 'interview-1-2026-07-15-10-30-45-technical.ics'));
  });
});
