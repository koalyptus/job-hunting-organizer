import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { Logger } from 'pino';
import { pathExists } from './fs.js';
import { CV_EXTENSIONS } from './constants.js';
import type { CvContent, CvFormat } from '../core/types.js';

/** Result of CV path validation. */
interface CvValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Validate a CV path. Checks existence and extension.
 * Returns `{ ok: true }` on success, or `{ ok: false, error }` with a message.
 */
export async function validateCvPath(cvPath: string): Promise<CvValidationResult> {
  if (!(await pathExists(cvPath))) {
    return { ok: false, error: `CV file not found: ${cvPath}` };
  }

  const dotIdx = cvPath.lastIndexOf('.');
  // Guard against hidden files with no extension (e.g. ".hidden")
  if (dotIdx < 0 || dotIdx === cvPath.length - 1) {
    return {
      ok: false,
      error: `Unsupported CV format. Supported: ${CV_EXTENSIONS.join(', ')}`,
    };
  }

  const ext = cvPath.substring(dotIdx).toLowerCase();

  if (!CV_EXTENSIONS.includes(ext)) {
    return {
      ok: false,
      error: `Unsupported CV format "${ext}". Supported: ${CV_EXTENSIONS.join(', ')}`,
    };
  }

  return { ok: true };
}

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
  // Dynamic import is intentional. `pdf-parse` pulls in heavy, native-binding
  // dependent modules (e.g. `@napi-rs/canvas`, `pdfjs-dist`) that throw at load
  // time on platforms without their native bindings, which crashes `jho-mcp`
  // startup. Lazy-loading keeps CV parsing out of the server's import graph so
  // the MCP server boots cleanly even when no PDF is ever read. Do not convert
  // this to a top-level import.
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function parseDocx(buffer: Buffer): Promise<string> {
  // Same rationale as {@link parsePdf}: load `mammoth` only when a DOCX is
  // actually parsed so it stays out of the MCP server's startup path. Do not
  // convert this to a top-level import.
  const { default: mammothDefault } = await import('mammoth');
  const result = await mammothDefault.extractRawText({ buffer });
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
