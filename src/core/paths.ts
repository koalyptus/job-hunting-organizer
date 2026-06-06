import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathExists } from './fs.js';
import { SLUG_PATTERN } from './slug.js';

// Re-exported for callers that previously imported it from paths.ts.
// The canonical home is `./slug.js`; new code should import from there.
export { SLUG_PATTERN };

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
export const DEFAULT_CAMPAIGNS_DIRNAME = 'campaigns';

export function isWindows(): boolean {
  return process.platform === 'win32';
}

export function resolveGlobalRoot(): string {
  const envRoot = process.env['JHO_ROOT'];
  if (envRoot !== undefined && envRoot !== '') {
    return resolve(envRoot);
  }
  return resolve(homedir(), DEFAULT_ROOT_DIRNAME);
}

export function resolveCampaignRoot(campaignName: string = 'default'): string {
  const globalRoot = resolveGlobalRoot();
  return resolve(globalRoot, DEFAULT_CAMPAIGNS_DIRNAME, campaignName);
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
    await mkdir(root, { recursive: true });
  }
}

export function isUnder(child: string, parent: string): boolean {
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

// Walk up from `cwd` looking for `<globalRoot>/campaigns/<name>`.
// If found, return the campaign name. Used by `jho --campaign <name>` cwd
// inference: if the user runs a command from inside
// `<global>/campaigns/freelance/...`, the campaign is `freelance`.
// Returns `null` if no campaigns ancestor is found in the path.
export function findCampaignFromCwd(cwd: string, globalRoot: string): string | null {
  if (!existsSync(globalRoot)) {
    return null;
  }
  const campaignsRoot = resolve(globalRoot, DEFAULT_CAMPAIGNS_DIRNAME);
  if (!existsSync(campaignsRoot)) {
    return null;
  }
  if (!isUnder(cwd, campaignsRoot)) {
    return null;
  }

  const normalizedCwd = resolve(cwd);
  const rel = relative(campaignsRoot, normalizedCwd);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    return null;
  }
  const first = rel.split(sep)[0];
  return first ?? null;
}
