import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, relative, resolve, sep, win32 } from 'node:path';
import { pathExists } from './fs.js';

// Defaults below are fallbacks used when config.json does not override them.
// In Phase 2b, core/config.ts loads the zod-validated config and resolvePaths()
// returns the user-configured values (config.profile.path, config.applied.dir,
// config.knowledgeBase.dir) in preference to these.
// CV is intentionally absent: it's a user-chosen file path (.pdf / .docx / .md)
// set during `jho init`, with no meaningful default.
export const DEFAULT_ROOT_DIRNAME = 'job-hunting-organizer';
export const DEFAULT_CONFIG_FILENAME = 'config.json';
export const DEFAULT_APPLIED_DIRNAME = 'applied';
export const DEFAULT_PROFILE_FILENAME = 'profile.md';
export const DEFAULT_KNOWLEDGE_BASE_DIRNAME = 'knowledge-base';
export const DEFAULT_LOG_FILE = '';
export const DEFAULT_WEB_SERVER_PORT = 7331;
export const DEFAULT_WEB_SERVER_HOST = '127.0.0.1';

export const SLUG_PATTERN = /^\d{4}-[A-Z][a-z]{2}-\d{2}-.+$/;

export function isWindows(): boolean {
  return process.platform === 'win32';
}

export function resolveRoot(override?: string): string {
  if (override !== undefined && override !== '') {
    return resolve(override);
  }
  const envRoot = process.env['JHO_ROOT'];
  if (envRoot !== undefined && envRoot !== '') {
    return resolve(envRoot);
  }
  return resolve(homedir(), DEFAULT_ROOT_DIRNAME);
}

export function resolveConfigPath(root: string): string {
  return resolve(root, DEFAULT_CONFIG_FILENAME);
}

export function resolveAppliedDir(root: string): string {
  return resolve(root, DEFAULT_APPLIED_DIRNAME);
}

export function resolveProfilePath(root: string): string {
  return resolve(root, DEFAULT_PROFILE_FILENAME);
}

export function resolveKnowledgeBaseDir(root: string): string {
  return resolve(root, DEFAULT_KNOWLEDGE_BASE_DIRNAME);
}

export async function findConfigPath(root: string): Promise<string | null> {
  const path = resolveConfigPath(root);
  if (await pathExists(path)) {
    return path;
  }
  return null;
}

export async function ensureRoot(root: string): Promise<void> {
  if (!(await pathExists(root))) {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(root, { recursive: true });
  }
}

function isUnder(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  if (rel === '') {
    return true;
  }
  if (rel.startsWith('..')) {
    return false;
  }
  return !isAbsolute(rel);
}

export function findSlugFromCwd(cwd: string, appliedDir: string): string | null {
  if (!existsSync(appliedDir)) {
    return null;
  }
  if (!isUnder(cwd, appliedDir)) {
    return null;
  }

  const normalizedCwd = resolve(cwd);
  const parts = normalizedCwd.split(sep);
  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = parts[i];
    if (candidate === undefined) {
      continue;
    }
    if (SLUG_PATTERN.test(candidate)) {
      const candidatePath = parts.slice(0, i + 1).join(sep);
      if (isUnder(candidatePath, appliedDir)) {
        return candidate;
      }
    }
  }
  return null;
}

export { isAbsolute, resolve, sep, win32, delimiter };
