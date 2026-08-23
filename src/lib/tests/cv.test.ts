import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetText = vi.fn();
const mockDestroy = vi.fn();

vi.mock('pdf-parse', () => ({
  PDFParse: vi.fn().mockImplementation(() => ({
    getText: mockGetText,
    destroy: mockDestroy,
  })),
}));

vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn(),
  },
}));

import mammoth from 'mammoth';
import { validateCvPath, readCv, CvError } from '../cv.js';

describe('CvError', () => {
  it('sets name, message, and code for unsupported_format', () => {
    const err = new CvError('Unsupported format', 'unsupported_format');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('CvError');
    expect(err.message).toBe('Unsupported format');
    expect(err.code).toBe('unsupported_format');
  });

  it('sets name, message, and code for parse_error', () => {
    const err = new CvError('Parse failed', 'parse_error');
    expect(err.name).toBe('CvError');
    expect(err.code).toBe('parse_error');
  });
});

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

describe('readCv', () => {
  let testDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    testDir = await mkdtemp(join(tmpdir(), 'jho-cv-read-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('reads a .txt file', async () => {
    const cvPath = join(testDir, 'cv.txt');
    await writeFile(cvPath, 'John Doe\nSoftware Engineer');

    const result = await readCv(cvPath);

    expect(result.text).toBe('John Doe\nSoftware Engineer');
    expect(result.format).toBe('text');
    expect(result.fileName).toBe('cv.txt');
  });

  it('reads a .md file', async () => {
    const cvPath = join(testDir, 'cv.md');
    await writeFile(cvPath, '# John Doe\n\n## Experience');

    const result = await readCv(cvPath);

    expect(result.text).toBe('# John Doe\n\n## Experience');
    expect(result.format).toBe('text');
    expect(result.fileName).toBe('cv.md');
  });

  it('reads a .pdf file via pdf-parse', async () => {
    mockGetText.mockResolvedValue({ text: 'PDF content here' });

    const cvPath = join(testDir, 'cv.pdf');
    await writeFile(cvPath, 'fake-pdf-bytes');

    const result = await readCv(cvPath);

    expect(result.text).toBe('PDF content here');
    expect(result.format).toBe('pdf');
    expect(result.fileName).toBe('cv.pdf');
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('reads a .docx file via mammoth', async () => {
    vi.mocked(mammoth.extractRawText).mockResolvedValue({ value: 'DOCX content', messages: [] });

    const cvPath = join(testDir, 'cv.docx');
    await writeFile(cvPath, 'fake-docx-bytes');

    const result = await readCv(cvPath);

    expect(result.text).toBe('DOCX content');
    expect(result.format).toBe('docx');
    expect(result.fileName).toBe('cv.docx');
  });

  it('throws CvError for unsupported format', async () => {
    const cvPath = join(testDir, 'cv.exe');
    await writeFile(cvPath, 'test');

    await expect(readCv(cvPath)).rejects.toThrow(CvError);
    await expect(readCv(cvPath)).rejects.toMatchObject({ code: 'unsupported_format' });
  });

  it('throws CvError for no extension', async () => {
    const cvPath = join(testDir, 'cvnoext');
    await writeFile(cvPath, 'test');

    await expect(readCv(cvPath)).rejects.toThrow(CvError);
    await expect(readCv(cvPath)).rejects.toMatchObject({ code: 'unsupported_format' });
  });

  it('throws CvError when pdf-parse fails', async () => {
    mockGetText.mockRejectedValue(new Error('invalid PDF'));

    const cvPath = join(testDir, 'cv.pdf');
    await writeFile(cvPath, 'corrupt-pdf');

    await expect(readCv(cvPath)).rejects.toThrow(CvError);
    await expect(readCv(cvPath)).rejects.toMatchObject({ code: 'parse_error' });
  });

  it('throws CvError when mammoth fails', async () => {
    vi.mocked(mammoth.extractRawText).mockRejectedValue(new Error('bad docx'));

    const cvPath = join(testDir, 'cv.docx');
    await writeFile(cvPath, 'corrupt-docx');

    await expect(readCv(cvPath)).rejects.toThrow(CvError);
    await expect(readCv(cvPath)).rejects.toMatchObject({ code: 'parse_error' });
  });

  it('logs format, size, and fileName when logger provided', async () => {
    const cvPath = join(testDir, 'cv.txt');
    await writeFile(cvPath, 'content');

    const mockLog = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };

    await readCv(cvPath, mockLog as never);

    expect(mockLog.info).toHaveBeenCalledWith(
      { format: 'text', size: 7, fileName: 'cv.txt' },
      'cv.read',
    );
  });

  it('does not crash when logger is omitted', async () => {
    const cvPath = join(testDir, 'cv.txt');
    await writeFile(cvPath, 'content');

    const result = await readCv(cvPath);
    expect(result.text).toBe('content');
  });
});
