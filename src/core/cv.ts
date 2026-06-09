import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import type { Logger } from 'pino';
import type { CvContent, CvFormat } from './types.js';

/**
 * Error thrown by {@link readCv} when the file cannot be parsed.
 * The `code` discriminates between a format the tool doesn't support
 * and a genuine parse failure.
 */
export class CvError extends Error {
  constructor(
    message: string,
    public readonly code: 'unsupported_format' | 'parse_error',
  ) {
    super(message);
    this.name = 'CvError';
  }
}

function detectFormat(filePath: string): CvFormat {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case '.pdf':
      return 'pdf';
    case '.docx':
      return 'docx';
    case '.txt':
    case '.md':
      return 'text';
    default:
      throw new CvError(`Unsupported CV format: ${ext || '(no extension)'}`, 'unsupported_format');
  }
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

function parseText(buffer: Buffer): string {
  return buffer.toString('utf8');
}

/**
 * Read and parse a CV file, returning its plain-text content and metadata.
 * Supports PDF, DOCX, TXT, and MD files. Throws {@link CvError} on
 * unsupported formats or parse failures.
 * @param path - Absolute or relative path to the CV file.
 * @param log - Optional pino logger; logs format, file size, and file name.
 * @returns The extracted text, detected format, and original file name.
 */
export async function readCv(path: string, log?: Logger): Promise<CvContent> {
  const format = detectFormat(path);
  const buffer = await readFile(path);
  const fileName = basename(path);

  if (log) {
    log.info({ format, size: buffer.length, fileName }, 'cv.read');
  }

  let text: string;
  try {
    switch (format) {
      case 'pdf':
        text = await parsePdf(buffer);
        break;
      case 'docx':
        text = await parseDocx(buffer);
        break;
      case 'text':
        text = parseText(buffer);
        break;
    }
  } catch (err) {
    throw new CvError(`Failed to parse ${format} file: ${(err as Error).message}`, 'parse_error');
  }

  return { text, format, fileName };
}
