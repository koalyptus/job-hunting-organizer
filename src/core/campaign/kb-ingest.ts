import { stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { resolveCampaignRoot, DEFAULT_MY_VOICE_FILENAME } from '../paths.js';
import { CV_EXTENSIONS, KB_GITHUB } from '../constants.js';
import { moduleLogger } from '../logger/logger.js';
import type { FileStore } from '../../storage/types.js';
import { campaignStoreFromRoot } from '../../storage/index.js';
import { StorageNotFoundError } from '../../storage/types.js';

const log = moduleLogger(import.meta.url);

const KB_DIR_REL = 'knowledge-base';

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
 * Resolve the campaign-scoped store (or use the injected one).
 */
function storeFor(campaign: string, store?: FileStore): FileStore {
  return store ?? campaignStoreFromRoot(resolveCampaignRoot(campaign));
}

/**
 * Copy user knowledge-base docs from `source` into the campaign's
 * `knowledge-base/` folder through the port. Accepts a single file or a
 * directory (walked recursively). Only {@link CV_EXTENSIONS} files are copied;
 * everything else is skipped silently. The `my-voice.md` file is explicitly
 * excluded from ingestion as it's a configuration file, not a knowledge document.
 *
 * @param campaign - Campaign folder name.
 * @param source - Absolute or relative path to a file or folder.
 * @param store - Optional campaign-scoped `FileStore` (for testing).
 * @returns The list of destination relative paths that were copied.
 */
export async function ingestKnowledgeBase(
  campaign: string,
  source: string,
  store?: FileStore,
): Promise<string[]> {
  const st = storeFor(campaign, store);
  const copied: string[] = [];
  const stats = await stat(source);

  if (stats.isFile()) {
    await copyOne(st, source, KB_DIR_REL, dirname(resolve(source)), copied);
    return copied;
  }

  await walkAndCopy(st, resolve(source), KB_DIR_REL, resolve(source), copied);
  return copied;
}

/**
 * List the knowledge-base doc relative paths currently present in the
 * campaign's `knowledge-base/` folder through the port. Excludes the
 * tool-owned `github/` subfolder, any `*.json` caches, and the personal
 * `my-voice.md` guide. Returns an empty array when the folder is absent.
 * @param campaign - Campaign folder name.
 * @param store - Optional campaign-scoped `FileStore` (for testing).
 * @returns The relative doc paths (e.g. `tips.md`, `sub/notes.txt`).
 */
export async function listKnowledgeBase(campaign: string, store?: FileStore): Promise<string[]> {
  const st = storeFor(campaign, store);
  try {
    return await listKbDocRelPaths(st, KB_DIR_REL, KB_DIR_REL);
  } catch (err) {
    if (err instanceof StorageNotFoundError) {
      return [];
    }
    throw err;
  }
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
 * @param campaign - Campaign folder name.
 * @param sources - Source paths recorded at init (may be empty).
 * @param store - Optional campaign-scoped `FileStore` (for testing).
 * @returns The list of destination relative paths now present in the KB.
 */
export async function syncKnowledgeBase(
  campaign: string,
  sources: string[],
  store?: FileStore,
): Promise<string[]> {
  const st = storeFor(campaign, store);

  if (sources.length === 0) {
    // No external sources recorded: just re-scan the folder in place.
    return listKnowledgeBase(campaign, st);
  }

  // Clear existing managed docs (keep github/, *.json, my-voice.md, and any
  // other user files). Only files with known doc extensions are removed; user
  // subdirs and other files are preserved so manual additions survive a re-sync.
  try {
    const entries = await st.readdir(KB_DIR_REL);
    for (const name of entries) {
      if (name === 'github') {
        continue;
      }
      if (isMyVoiceFile(name)) {
        continue;
      }
      if (extname(name).toLowerCase() === '.json') {
        continue;
      }
      const rel = `${KB_DIR_REL}/${name}`;
      const isDir = await isDirectory(st, rel);
      if (isDir) {
        // Preserve user subdirs — we only manage individual files.
        continue;
      }
      if (!CV_EXTENSIONS.includes(extname(name).toLowerCase())) {
        // Skip files we don't manage.
        continue;
      }
      await st.rm(rel, { recursive: true });
    }
  } catch (err) {
    if (!(err instanceof StorageNotFoundError)) {
      throw err;
    }
  }

  const copied: string[] = [];
  for (const source of sources) {
    if (!(await pathExistsFs(source))) {
      log.warn({ source }, 'kb.sync.source_missing');
      continue;
    }
    copied.push(...(await ingestKnowledgeBase(campaign, source, st)));
  }
  return copied;
}

/**
 * Recursively list KB doc relative paths under a root-relative directory.
 */
async function listKbDocRelPaths(
  store: FileStore,
  relDir: string,
  root: string,
): Promise<string[]> {
  const out: string[] = [];
  const entries = await store.readdir(relDir);
  for (const name of entries) {
    const rel = relDir === root ? name : `${relDir}/${name}`;
    if (name === KB_GITHUB) {
      continue;
    }
    const isDir = await isDirectory(store, rel);
    if (isDir) {
      out.push(...(await listKbDocRelPaths(store, rel, root)));
      continue;
    }
    if (isMyVoiceFile(name)) {
      continue;
    }
    if (extname(name).toLowerCase() === '.json') {
      continue;
    }
    if (!CV_EXTENSIONS.includes(extname(name).toLowerCase())) {
      continue;
    }
    out.push(rel);
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

/**
 * Copy a single file into the KB folder (root-relative) through the store.
 */
async function copyOne(
  store: FileStore,
  from: string,
  kbRelDir: string,
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
  const destRel = rel === '' ? `${kbRelDir}/${basename(from)}` : `${kbRelDir}/${rel}`;
  // The source is read via direct fs (it is outside the data root, an import
  // from the user's filesystem) but the write goes through the port.
  const content = await readBytesFs(from);
  await store.write(destRel, content);
  copied.push(rel === '' ? basename(from) : rel);
}

/**
 * Recursively walk a source directory and copy each doc into the KB.
 */
async function walkAndCopy(
  store: FileStore,
  fromDir: string,
  kbRelDir: string,
  sourceRoot: string,
  copied: string[],
): Promise<void> {
  const { readdir } = await import('node:fs/promises');
  const items = await readdir(fromDir, { withFileTypes: true });
  for (const item of items) {
    const abs = resolve(fromDir, item.name);
    if (item.isDirectory()) {
      if (item.name === KB_GITHUB) {
        continue;
      }
      await walkAndCopy(store, abs, kbRelDir, sourceRoot, copied);
      continue;
    }
    if (item.isFile()) {
      await copyOne(store, abs, kbRelDir, sourceRoot, copied);
    }
  }
}

/** Whether a store entry is a directory (stat-based discriminator). */
async function isDirectory(store: FileStore, rel: string): Promise<boolean> {
  try {
    const s = await store.stat(rel);
    return s.kind === 'directory';
  } catch {
    return false;
  }
}

/** Direct-fs existence check (source paths live outside the data root). */
async function pathExistsFs(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code === 'ENOENT' ||
      (err as NodeJS.ErrnoException).code === 'ENOTDIR'
    ) {
      return false;
    }
    throw err;
  }
}

/** Direct-fs read of the source bytes (import path lives outside the data root). */
async function readBytesFs(p: string): Promise<Uint8Array> {
  const { readFile } = await import('node:fs/promises');
  return readFile(p);
}
