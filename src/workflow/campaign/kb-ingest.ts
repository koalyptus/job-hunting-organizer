import { copyFile, readdir, stat, mkdir, rm } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { resolveKnowledgeBaseDir, DEFAULT_MY_VOICE_FILENAME } from '../../lib/paths.js';
import { pathExists } from '../../lib/fs.js';
import { CV_EXTENSIONS, KB_GITHUB } from '../../lib/constants.js';
import { moduleLogger } from '../../lib/logger/logger.js';

const log = moduleLogger(import.meta.url);

/**
 * Whether a file is the campaign's personal voice guide. The voice file is
 * excluded from ingestion, re-sync cleanup, listing, and LLM context — it is
 * a configuration file for output personalization, not a knowledge document.
 * @param filename - The file name (basename) to test.
 */
function isMyVoiceFile(filename: string): boolean {
  return filename === DEFAULT_MY_VOICE_FILENAME;
}

/**
 * Copy user knowledge-base docs from `source` into the campaign's
 * `knowledge-base/` folder. Accepts a single file or a directory
 * (walked recursively). Only {@link CV_EXTENSIONS} files are copied;
 * everything else is skipped silently. The `my-voice.md` file is explicitly
 * excluded from ingestion as it's a configuration file, not a knowledge document.
 *
 * @param campaignRoot - Absolute path to the campaign root.
 * @param source - Absolute or relative path to a file or folder.
 * @returns The list of destination relative paths that were copied.
 */
export async function ingestKnowledgeBase(campaignRoot: string, source: string): Promise<string[]> {
  const kbDir = resolveKnowledgeBaseDir(campaignRoot);
  await mkdir(kbDir, { recursive: true });

  const copied: string[] = [];
  const stats = await stat(source);

  if (stats.isFile()) {
    await copyOne(source, kbDir, dirname(resolve(source)), copied);
    return copied;
  }

  await walkAndCopy(resolve(source), kbDir, resolve(source), copied);
  return copied;
}

/**
 * List the knowledge-base doc relative paths currently present in the
 * campaign's `knowledge-base/` folder. Excludes the tool-owned `github/`
 * subfolder, any `*.json` caches, and the personal `my-voice.md` guide.
 * Returns an empty array when the folder is absent.
 * @param campaignRoot - Absolute path to the campaign root.
 * @returns The relative doc paths (e.g. `tips.md`, `sub/notes.txt`).
 */
export async function listKnowledgeBase(campaignRoot: string): Promise<string[]> {
  const kbDir = resolveKnowledgeBaseDir(campaignRoot);
  if (!(await pathExists(kbDir))) {
    return [];
  }
  return listKbDocRelPaths(kbDir, kbDir);
}

/**
 * Re-sync the knowledge base. When `sources` is non-empty, docs are
 * re-pulled from those external paths (the existing user docs are cleared
 * first, but the tool-owned `github/` subfolder, `*.json` caches, and the
 * personal `my-voice.md` guide are preserved). When `sources` is empty, the
 * knowledge base is simply re-scanned in place — docs placed manually or via
 * `jho kb add` are left untouched and reported back. This means `jho kb update`
 * always reflects the current folder state and never errors on an empty source
 * list.
 * @param campaignRoot - Absolute path to the campaign root.
 * @param sources - Source paths recorded at init (may be empty).
 * @returns The list of destination relative paths now present in the KB.
 */
export async function syncKnowledgeBase(
  campaignRoot: string,
  sources: string[],
): Promise<string[]> {
  const kbDir = resolveKnowledgeBaseDir(campaignRoot);

  if (sources.length === 0) {
    // No external sources recorded: just re-scan the folder in place.
    return listKnowledgeBase(campaignRoot);
  }

  // Clear existing managed docs (keep github/, *.json, my-voice.md, and any
  // other user files). Only files with known doc extensions are removed; user
  // subdirs and other files are preserved so manual additions survive a re-sync.
  if (await pathExists(kbDir)) {
    const entries = await readdir(kbDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'github') {
        continue;
      }
      if (isMyVoiceFile(entry.name)) {
        continue;
      }
      if (entry.isFile() && extname(entry.name).toLowerCase() === '.json') {
        continue;
      }
      if (!entry.isFile()) {
        // Preserve user subdirs — we only manage individual files.
        continue;
      }
      if (!CV_EXTENSIONS.includes(extname(entry.name).toLowerCase())) {
        // Skip files we don't manage.
        continue;
      }
      await rm(join(kbDir, entry.name), { recursive: true, force: true });
    }
  }

  const copied: string[] = [];
  for (const source of sources) {
    if (!(await pathExists(source))) {
      log.warn({ source }, 'kb.sync.source_missing');
      continue;
    }
    copied.push(...(await ingestKnowledgeBase(campaignRoot, source)));
  }
  return copied;
}

async function listKbDocRelPaths(root: string, dir: string): Promise<string[]> {
  const out: string[] = [];
  const items = await readdir(dir, { withFileTypes: true });
  for (const item of items) {
    const abs = join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name === 'github') {
        continue;
      }
      out.push(...(await listKbDocRelPaths(root, abs)));
      continue;
    }
    if (item.isFile()) {
      if (isMyVoiceFile(item.name)) {
        continue;
      }
      if (extname(item.name).toLowerCase() === '.json') {
        continue;
      }
      if (!CV_EXTENSIONS.includes(extname(item.name).toLowerCase())) {
        continue;
      }
      out.push(relative(root, abs).split('\\').join('/'));
    }
  }
  return out;
}

/** Error thrown by knowledge-base ingestion operations. */
export class KbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KbError';
  }
}

async function copyOne(
  from: string,
  kbDir: string,
  sourceRoot: string,
  copied: string[],
): Promise<void> {
  if (!CV_EXTENSIONS.includes(extname(from).toLowerCase())) {
    return;
  }
  // Skip my-voice.md by name so a coincidental file in an ingested source
  // directory cannot overwrite the campaign's personal voice guide.
  if (isMyVoiceFile(basename(from))) {
    log.debug({ from }, 'kb.ingest.skipped_my_voice');
    return;
  }
  const rel = relative(sourceRoot, from).split('\\').join('/');
  if (rel.startsWith('..') || isAbsolute(rel)) {
    log.warn({ from, sourceRoot }, 'kb.ingest.skipped_path_traversal');
    return;
  }
  const dest = join(kbDir, rel);
  const destDir = dirname(dest);
  if (destDir !== '.') {
    await mkdir(destDir, { recursive: true });
  }
  await copyFile(from, dest);
  copied.push(rel);
}

async function walkAndCopy(
  fromDir: string,
  kbDir: string,
  sourceRoot: string,
  copied: string[],
): Promise<void> {
  const items = await readdir(fromDir, { withFileTypes: true });
  for (const item of items) {
    const abs = join(fromDir, item.name);
    if (item.isDirectory()) {
      if (item.name === KB_GITHUB) {
        continue;
      }
      await walkAndCopy(abs, kbDir, sourceRoot, copied);
      continue;
    }
    if (item.isFile()) {
      await copyOne(abs, kbDir, sourceRoot, copied);
    }
  }
}
