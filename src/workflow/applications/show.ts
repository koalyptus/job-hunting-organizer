/**
 * Core read functions for `jho show`. No CLI concerns.
 * Reuses `readApplication`, `readFile`, `readdir` from sibling modules.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readApplication } from './applications.js';
import type { ApplicationFrontmatter } from './types.js';

/**
 * Thrown when a show operation fails (missing app, missing file).
 */
export class ShowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShowError';
  }
}

/** Files that may exist in an application folder (type-only union). */
export type ApplicationFile =
  | 'meta.md'
  | 'jd.md'
  | 'cover-letter.md'
  | 'qa.md'
  | 'interviews.md'
  | 'retro.md'
  | 'prepare.md'
  | 'notes.md';

/**
 * Single source of truth for showable files.
 * Maps file names to their CLI flag and display label.
 * Used by both the core module (file existence check) and the CLI
 * (to generate Commander options via a loop).
 */
export const SHOWABLE_FILES = [
  { flag: 'jd', file: 'jd.md' as ApplicationFile, label: 'job description' },
  { flag: 'meta', file: 'meta.md' as ApplicationFile, label: 'application metadata' },
  { flag: 'cover-letter', file: 'cover-letter.md' as ApplicationFile, label: 'cover letter' },
  { flag: 'qa', file: 'qa.md' as ApplicationFile, label: 'Q&A entries' },
  { flag: 'interviews', file: 'interviews.md' as ApplicationFile, label: 'interview entries' },
] as const;

/** Result of reading an application for display. */
export interface ShowResult {
  frontmatter: ApplicationFrontmatter;
  body: string;
  filesPresent: ApplicationFile[];
}

/**
 * Read an application and determine which files exist in its folder.
 * Pure read — no I/O side effects beyond reading.
 * @param appliedDir - Absolute path to the campaign's `applied/` directory.
 * @param slug - Application slug.
 * @throws {ShowError} if the application doesn't exist.
 */
export async function readShowData(appliedDir: string, slug: string): Promise<ShowResult> {
  let application;
  try {
    application = await readApplication(appliedDir, slug);
  } catch (err) {
    throw new ShowError(err instanceof Error ? err.message : String(err));
  }

  const folder = join(appliedDir, slug);
  const filesPresent: ApplicationFile[] = [];

  for (const { file } of SHOWABLE_FILES) {
    if (existsSync(join(folder, file))) {
      filesPresent.push(file);
    }
  }
  // Also check additional files not in SHOWABLE_FILES
  const otherFiles: ApplicationFile[] = ['retro.md', 'prepare.md', 'notes.md'];
  for (const name of otherFiles) {
    if (existsSync(join(folder, name))) {
      filesPresent.push(name);
    }
  }

  return { frontmatter: application.frontmatter, body: application.body, filesPresent };
}

/**
 * Strip jho marker lines from raw file content for cleaner display.
 */
const JHO_MARKER_REGEX = /^<!-- jho:(?:start|end):[^>]+ -->\s*\n?/gm;

/**
 * Read a specific file's content for display.
 * Strips jho marker lines so the user sees clean output.
 * @param appliedDir - Absolute path to the campaign's `applied/` directory.
 * @param slug - Application slug.
 * @param fileName - The file to read.
 * @returns The file content with marker lines stripped.
 * @throws {ShowError} if the file does not exist.
 */
export async function readShowFile(
  appliedDir: string,
  slug: string,
  fileName: ApplicationFile,
): Promise<string> {
  const filePath = join(appliedDir, slug, fileName);
  if (!existsSync(filePath)) {
    throw new ShowError(`File not found: ${fileName}`);
  }
  const fileContent = await readFile(filePath, 'utf8');
  return fileContent.replace(JHO_MARKER_REGEX, '');
}
