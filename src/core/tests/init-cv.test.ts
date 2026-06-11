import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateCvPath } from '../init/cv.js';

describe('validateCvPath', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'jho-cv-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('returns ok for valid PDF path', async () => {
    const cvPath = join(testDir, 'cv.pdf');
    await writeFile(cvPath, 'test');
    const result = await validateCvPath(cvPath);
    expect(result.ok).toBe(true);
  });

  it('returns ok for valid MD path', async () => {
    const cvPath = join(testDir, 'cv.md');
    await writeFile(cvPath, 'test');
    const result = await validateCvPath(cvPath);
    expect(result.ok).toBe(true);
  });

  it('returns ok for valid DOCX path', async () => {
    const cvPath = join(testDir, 'cv.docx');
    await writeFile(cvPath, 'test');
    const result = await validateCvPath(cvPath);
    expect(result.ok).toBe(true);
  });

  it('returns ok for valid TXT path', async () => {
    const cvPath = join(testDir, 'cv.txt');
    await writeFile(cvPath, 'test');
    const result = await validateCvPath(cvPath);
    expect(result.ok).toBe(true);
  });

  it('returns error for non-existent file', async () => {
    const cvPath = join(testDir, 'nonexistent.pdf');
    const result = await validateCvPath(cvPath);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns error for unsupported extension', async () => {
    const cvPath = join(testDir, 'cv.exe');
    await writeFile(cvPath, 'test');
    const result = await validateCvPath(cvPath);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Unsupported');
  });

  it('returns error for .doc extension', async () => {
    const cvPath = join(testDir, 'cv.doc');
    await writeFile(cvPath, 'test');
    const result = await validateCvPath(cvPath);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Unsupported');
  });

  it('handles case-insensitive extensions', async () => {
    const cvPath = join(testDir, 'CV.PDF');
    await writeFile(cvPath, 'test');
    const result = await validateCvPath(cvPath);
    expect(result.ok).toBe(true);
  });
});
