import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import JSZip from 'jszip';
import { CvError, readCv } from '../cv.js';

const MINIMAL_PDF_BASE64 =
  'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA0NCA+PgpzdHJlYW0KQlQgL0YxIDEyIFRmIDEwMCA3MDAgVGQgKEhlbGxvIFdvcmxkKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgDQowMDAwMDAwMDA5IDAwMDAwIG4gDQowMDAwMDAwMDU4IDAwMDAwIG4gDQowMDAwMDAwMTE1IDAwMDAwIG4gDQowMDAwMDAwMjc0IDAwMDAwIG4gDQowMDAwMDAwMzMwIDAwMDAwIG4gDQp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjM4NQolJUVPRgo=';

const CV_TEXT =
  'John Doe\nSoftware Engineer with 8 years of experience\n\nSkills: TypeScript, Python, Go';

async function createDocxBuffer(text: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${text}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('readCv', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'jho-cv-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('reads plain text .txt files', async () => {
    const file = join(workDir, 'cv.txt');
    await writeFile(file, CV_TEXT);

    const result = await readCv(file);

    expect(result.text).toBe(CV_TEXT);
    expect(result.format).toBe('text');
    expect(result.fileName).toBe('cv.txt');
  });

  it('reads plain text .md files as text', async () => {
    const file = join(workDir, 'cv.md');
    await writeFile(file, CV_TEXT);

    const result = await readCv(file);

    expect(result.text).toBe(CV_TEXT);
    expect(result.format).toBe('text');
    expect(result.fileName).toBe('cv.md');
  });

  it('reads .docx files', async () => {
    const docx = await createDocxBuffer('Hello World');
    const file = join(workDir, 'cv.docx');
    await writeFile(file, docx);

    const result = await readCv(file);

    expect(result.text).toContain('Hello World');
    expect(result.format).toBe('docx');
    expect(result.fileName).toBe('cv.docx');
  });

  it('reads .pdf files', async () => {
    const pdf = Buffer.from(MINIMAL_PDF_BASE64, 'base64');
    const file = join(workDir, 'cv.pdf');
    await writeFile(file, pdf);

    const result = await readCv(file);

    expect(result.text).toContain('Hello World');
    expect(result.format).toBe('pdf');
    expect(result.fileName).toBe('cv.pdf');
  });

  it('throws CvError for unsupported format', async () => {
    const file = join(workDir, 'cv.html');
    await writeFile(file, '<html></html>');

    await expect(readCv(file)).rejects.toThrow(CvError);

    await expect(readCv(file)).rejects.toMatchObject({
      code: 'unsupported_format',
    });
  });

  it('throws CvError when file has no extension', async () => {
    const file = join(workDir, 'cv');
    await writeFile(file, 'some content');

    await expect(readCv(file)).rejects.toMatchObject({
      code: 'unsupported_format',
    });
  });

  it('propagates ENOENT for missing files', async () => {
    await expect(readCv(join(workDir, 'nonexistent.pdf'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('throws CvError for corrupt PDF data', async () => {
    const file = join(workDir, 'corrupt.pdf');
    await writeFile(file, 'NOT A PDF');

    await expect(readCv(file)).rejects.toThrow(CvError);

    await expect(readCv(file)).rejects.toMatchObject({
      code: 'parse_error',
    });
  });

  it('throws CvError for corrupt DOCX data', async () => {
    const file = join(workDir, 'corrupt.docx');
    await writeFile(file, 'NOT A DOCX');

    await expect(readCv(file)).rejects.toThrow(CvError);

    await expect(readCv(file)).rejects.toMatchObject({
      code: 'parse_error',
    });
  });

  it('handles empty text files', async () => {
    const file = join(workDir, 'empty.txt');
    await writeFile(file, '');

    const result = await readCv(file);

    expect(result.text).toBe('');
    expect(result.format).toBe('text');
    expect(result.fileName).toBe('empty.txt');
  });

  it('logs when a logger is provided', async () => {
    const file = join(workDir, 'cv.txt');
    await writeFile(file, CV_TEXT);

    const log = { info: vi.fn() };
    await readCv(file, log as never);

    expect(log.info).toHaveBeenCalledOnce();
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'text',
        fileName: 'cv.txt',
        size: CV_TEXT.length,
      }),
      'cv.read',
    );
  });
});
