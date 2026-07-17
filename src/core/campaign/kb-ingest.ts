import { copyFile, readdir, stat, mkdir, rm } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { resolveKnowledgeBaseDir } from '../paths.js';
import { pathExists } from '../fs.js';
import { CV_EXTENSIONS } from '../constants.js';
import { moduleLogger } from '../logger/logger.js';

const log = moduleLogger(import.meta.url);

/**
 * Copy user knowledge-base docs from `source` into the campaign's
 * `knowledge-base/` folder. Accepts a single file or a directory
 * (walked recursively). Only {@link CV_EXTENSIONS} files are copied;
 * everything else is skipped silently.
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
 * subfolder and any `*.json` caches. Returns an empty array when the
 * folder is absent.
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
 * first, but the tool-owned `github/` subfolder and `*.json` caches are
 * preserved). When `sources` is empty, the knowledge base is simply
 * re-scanned in place — docs placed manually or via `jho kb add` are
 * left untouched and reported back. This means `jho kb update` always
 * reflects the current folder state and never errors on an empty source
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

  // Clear existing managed docs (keep github/, *.json, and any other user files).
  // Only files with known doc extensions are removed; user subdirs and other
  // files are preserved so manual additions survive a re-sync.
  if (await pathExists(kbDir)) {
    const entries = await readdir(kbDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'github') {
        continue;
      }
      if (entry.isFile() && extname(entry.name).toLowerCase() === '.json') {
        continue;
      }
      if (entry.isFile() && !CV_EXTENSIONS.includes(extname(entry.name).toLowerCase())) {
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
      await walkAndCopy(abs, kbDir, sourceRoot, copied);
      continue;
    }
    if (item.isFile()) {
      await copyOne(abs, kbDir, sourceRoot, copied);
    }
  }
}
