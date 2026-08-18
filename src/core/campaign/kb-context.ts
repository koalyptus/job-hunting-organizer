import { extname, join } from 'node:path';
import { resolveCampaignRoot, DEFAULT_MY_VOICE_FILENAME } from '../paths.js';
import { readCv, CvError } from '../cv.js';
import { KB_GITHUB, CV_EXTENSIONS } from '../constants.js';
import { moduleLogger } from '../logger/logger.js';
import { getConfig } from '../config/config.js';
import type { FileStore } from '../../storage/types.js';
import { campaignStoreFromRoot } from '../../storage/index.js';
import { StorageNotFoundError } from '../../storage/types.js';

const log = moduleLogger(import.meta.url);

/** A single knowledge-base document: its root-relative path and absolute path. */
interface KnowledgeBaseDoc {
  /** Absolute path to the doc on disk (used for parsing). */
  abs: string;
  /** Path relative to the knowledge-base root, using forward slashes. */
  rel: string;
}

/** Options for {@link loadKnowledgeBaseContext}. */
interface LoadKbOptions {
  /** Optional campaign-scoped `FileStore` (for testing). */
  store?: FileStore;
  /** Optional character cap. When exceeded, content is truncated oldest-first. */
  maxChars?: number | undefined;
}

const KB_DIR_REL = 'knowledge-base';

/**
 * Load the per-campaign knowledge base as a single markdown string for LLM context,
 * through the storage port.
 *
 * Walks `knowledge-base/` recursively, skipping the tool-owned `github/` subfolder
 * and `*.json` caches. Each file with a recognised extension (`.md`, `.txt`, `.pdf`,
 * `.docx`) is parsed via {@link readCv} and appended under a per-file heading. Read or
 * parse errors are logged and skipped — this function never throws on a bad user doc.
 *
 * Returns an empty string when the folder is absent or contains no readable docs.
 * @param campaign - Campaign folder name.
 * @param store - Optional campaign-scoped `FileStore` (for testing).
 * @param opts - Optional `maxChars` cap; truncation logs a `kb.truncated` warning.
 * @returns Concatenated knowledge-base context, or `''` when empty.
 */
export async function loadKnowledgeBaseContext(
  campaign: string,
  opts?: LoadKbOptions,
): Promise<string> {
  const st = opts?.store ?? campaignStoreFromRoot(resolveCampaignRoot(campaign));

  // Collect every knowledge-base doc as a root-relative path.
  const relPaths: string[] = [];
  try {
    await collectKbDocs(st, KB_DIR_REL, '', relPaths);
  } catch (err) {
    if (err instanceof StorageNotFoundError) {
      return '';
    }
    throw err;
  }

  if (relPaths.length === 0) {
    return '';
  }

  // Map each relative path back to its absolute on-disk location for parsing,
  // derived from the store's data root so the resolution stays backend-agnostic
  // (and correct when a test injects a store rooted elsewhere).
  const kbDirAbs = join(st.getDataRoot(), KB_DIR_REL);
  const entries: KnowledgeBaseDoc[] = relPaths.map((rel) => ({
    abs: join(kbDirAbs, rel),
    rel,
  }));

  const parts: string[] = [];
  let total = 0;
  let isTruncated = false;

  for (const { abs, rel } of entries) {
    let text: string;

    try {
      const content = await readCv(abs, log);
      text = content.text;
    } catch (err) {
      if (err instanceof CvError) {
        log.warn({ file: rel, code: err.code }, 'kb.read_failed');
      } else if (err instanceof Error) {
        log.warn({ file: rel, message: err.message }, 'kb.read_error');
      } else {
        log.warn({ file: rel, error: String(err) }, 'kb.read_error');
      }
      continue;
    }

    const block = `## Knowledge base: ${rel}\n\n${text}\n\n`;

    if (opts?.maxChars !== undefined && total + block.length > opts.maxChars) {
      const remaining = opts.maxChars - total;
      if (remaining > 0) {
        parts.push(block.slice(0, remaining));
        total += remaining;
      }
      isTruncated = true;
      break;
    }

    parts.push(block);
    total += block.length;
  }

  if (isTruncated) {
    log.warn({ maxChars: opts?.maxChars, kept: total }, 'kb.truncated');
  }

  return parts.join('');
}

/**
 * Convenience wrapper: loads the knowledge-base context for a campaign,
 * automatically resolving `maxChars` from the campaign config.
 * @param campaign - Campaign folder name.
 * @param opts - Optional store injection and `maxChars` override.
 * @returns Concatenated knowledge-base context, or `''` when empty.
 */
export async function loadKbContextForCampaign(
  campaign: string,
  opts?: LoadKbOptions,
): Promise<string> {
  const { campaign: cfg } = getConfig(campaign);
  return loadKnowledgeBaseContext(campaign, {
    store: opts?.store,
    maxChars: opts?.maxChars ?? cfg.knowledgeBase.maxChars,
  });
}

/**
 * Recursively collect knowledge-base doc relative paths through the store,
 * skipping `github/` and `*.json` caches and the personal `my-voice.md` guide.
 * @param store - The campaign-scoped store.
 * @param relDir - Root-relative directory being walked (e.g. `knowledge-base`
 *   or `knowledge-base/sub`).
 * @param kbRel - Knowledge-base-relative directory for output labelling (e.g.
 *   `` or `sub`); strips the `knowledge-base/` prefix so nested docs surface as
 *   `sub/deep.md` rather than `knowledge-base/sub/deep.md`.
 * @param out - Accumulator of knowledge-base-relative doc paths.
 */
async function collectKbDocs(
  store: FileStore,
  relDir: string,
  kbRel: string,
  out: string[],
): Promise<void> {
  const entries = await store.readdir(relDir);
  for (const name of entries) {
    // `rel` is root-relative and used for store stat/read operations.
    const rel = relDir === '' ? name : `${relDir}/${name}`;
    // `kRel` is relative to the knowledge-base root, for the LLM heading and
    // the absolute-path join used for parsing.
    const kRel = kbRel === '' ? name : `${kbRel}/${name}`;
    if (name === KB_GITHUB) {
      continue;
    }
    const isDir = await isDirectory(store, rel);
    if (isDir) {
      await collectKbDocs(store, rel, kRel, out);
      continue;
    }
    if (name === DEFAULT_MY_VOICE_FILENAME) {
      continue;
    }
    if (extname(name).toLowerCase() === '.json') {
      continue;
    }
    if (!CV_EXTENSIONS.includes(extname(name).toLowerCase())) {
      continue;
    }
    out.push(kRel);
  }
}

/**
 * Whether a store entry is a directory. `readdir` only yields names, so we
 * stat to discriminate — the contract test's `isDirectory` helper does the
 * same and keeps the method in one place.
 */
async function isDirectory(store: FileStore, rel: string): Promise<boolean> {
  try {
    const stat = await store.stat(rel);
    return stat.kind === 'directory';
  } catch {
    return false;
  }
}
