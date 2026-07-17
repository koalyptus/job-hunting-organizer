import { readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { resolveKnowledgeBaseDir } from '../paths.js';
import { pathExists } from '../fs.js';
import { readCv, CvError } from '../cv.js';
import { KB_GITHUB, CV_EXTENSIONS } from '../constants.js';
import { moduleLogger } from '../logger/logger.js';

const log = moduleLogger(import.meta.url);

/** A single knowledge-base document: its absolute path and its posix-relative path. */
interface KnowledgeBaseDoc {
  /** Absolute path to the doc on disk. */
  abs: string;
  /** Path relative to the knowledge-base root, using forward slashes. */
  rel: string;
}

/** Options for {@link loadKnowledgeBaseContext}. */
interface LoadKbOptions {
  /** Optional character cap. When exceeded, content is truncated oldest-first. */
  maxChars?: number | undefined;
}

/**
 * Load the per-campaign knowledge base as a single markdown string for LLM context.
 *
 * Walks `knowledge-base/` recursively, skipping the tool-owned `github/` subfolder
 * and `*.json` caches. Each file with a recognised extension (`.md`, `.txt`, `.pdf`,
 * `.docx`) is parsed via {@link readCv} and appended under a per-file heading. Read or
 * parse errors are logged and skipped — this function never throws on a bad user doc.
 *
 * Returns an empty string when the folder is absent or contains no readable docs.
 * @param campaignRoot - Absolute path to the campaign root.
 * @param opts - Optional `maxChars` cap; truncation logs a `kb.truncated` warning.
 * @returns Concatenated knowledge-base context, or `''` when empty.
 */
export async function loadKnowledgeBaseContext(
  campaignRoot: string,
  opts?: LoadKbOptions,
): Promise<string> {
  const kbDir = resolveKnowledgeBaseDir(campaignRoot);

  if (!(await pathExists(kbDir))) {
    return '';
  }

  const entries: KnowledgeBaseDoc[] = [];

  await collectKbDocsWithPaths(kbDir, kbDir, entries);

  if (entries.length === 0) {
    return '';
  }

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
 * Recursively collect knowledge-base doc files, skipping `github/` and `*.json`.
 * @param root - The knowledge-base root (for skip checks).
 * @param dir - Directory currently being walked.
 * @param out - Accumulator of {@link KnowledgeBaseDoc} entries.
 */
async function collectKbDocsWithPaths(
  root: string,
  dir: string,
  out: KnowledgeBaseDoc[],
): Promise<void> {
  const items = await readdir(dir, { withFileTypes: true });

  for (const item of items) {
    const abs = join(dir, item.name);

    if (item.isDirectory()) {
      if (item.name === KB_GITHUB) {
        continue;
      }
      await collectKbDocsWithPaths(root, abs, out);
      continue;
    }

    if (item.isFile()) {
      if (extname(item.name).toLowerCase() === '.json') {
        continue;
      }
      if (!CV_EXTENSIONS.includes(extname(item.name).toLowerCase())) {
        continue;
      }
      out.push({ abs, rel: relative(root, abs).split('\\').join('/') });
    }
  }
}
