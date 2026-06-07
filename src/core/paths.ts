import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathExists } from './fs.js';
import { SLUG_PATTERN } from './slug.js';

// Re-exported for callers that previously imported it from paths.ts.
// The canonical home is `./slug.js`; new code should import from there.
export { SLUG_PATTERN };

/**
 * Default name of the campaign data root folder under the user's home
 * directory. This is where `<campaigns>/<name>/` lives — i.e. the
 * user-authored working data (resumes, JDs, cover letters, retro notes,
 * KB). Used when `$JHO_DATA` is not set.
 *
 * The `-data` suffix distinguishes this folder from the global config
 * home (`DEFAULT_CONFIG_HOMEDIR`); the two live side by side under
 * `<homedir>` and have clearly different roles.
 */
export const DEFAULT_DATA_ROOT_DIRNAME = 'job-hunting-organizer-data';

/**
 * Default name of the global config home folder under the user's home
 * directory. This holds the global `config.json` (LLM creds, GitHub
 * token, calendar provider, logging defaults) and the `proper-lockfile`
 * `.locks/` sidecars. Used when `$JHO_CONFIG_HOME` is not set.
 *
 * The leading dot keeps it hidden from `ls` on Linux/macOS; on Windows
 * the dot is preserved in the path even though Explorer ignores the
 * "hidden = leading dot" convention. The dotted name mirrors common
 * Unix patterns (`~/.npm/`, `~/.cargo/`, `~/.ssh/`).
 */
export const DEFAULT_CONFIG_HOMEDIR = '.job-hunting-organizer';

/**
 * Default filename for the JSON config file at any level (global or
 * campaign). Exposed so callers can reference it without re-typing the
 * literal.
 */
export const DEFAULT_CONFIG_FILENAME = 'config.json';

/** Default name of the per-campaign `applied/` directory. */
export const DEFAULT_APPLIED_DIRNAME = 'applied';

/** Default name of the per-campaign profile file. */
export const DEFAULT_PROFILE_FILENAME = 'profile.md';

/** Default name of the per-campaign knowledge-base directory. */
export const DEFAULT_KNOWLEDGE_BASE_DIRNAME = 'knowledge-base';

/** Default name of the campaigns subdirectory inside the data root. */
export const DEFAULT_CAMPAIGNS_DIRNAME = 'campaigns';

/**
 * Whether the current process is running on Windows. Used for OS-specific
 * tweaks (e.g. ignoring `EPERM` from `chmod`). Not currently branched on,
 * but exposed for future use.
 * @returns `true` on Windows, `false` elsewhere.
 */
export function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Resolve the absolute path of the **campaign data root**. This is the
 * folder that contains `campaigns/<name>/` — the user-authored working
 * data. It is *separate* from the global config home (see
 * {@link resolveConfigHome}).
 *
 * Honours the `$JHO_DATA` environment variable if set and non-empty;
 * otherwise falls back to `<homedir>/job-hunting-organizer-data`.
 *
 * No `--data-root` CLI flag is supported by design — the env var is the
 * only override (matches `git`, VS Code, `ssh` for location conventions).
 * @returns The absolute path to the data root.
 */
export function resolveDataRoot(): string {
  const envRoot = process.env['JHO_DATA'];
  if (envRoot !== undefined && envRoot !== '') {
    return resolve(envRoot);
  }
  return resolve(homedir(), DEFAULT_DATA_ROOT_DIRNAME);
}

/**
 * Resolve the absolute path of the **global config home**. This is the
 * folder that holds the global `config.json` (LLM creds, GitHub token,
 * calendar provider, logging defaults) and `proper-lockfile` sidecars.
 * It is *separate* from the campaign data root (see
 * {@link resolveDataRoot}).
 *
 * Honours the `$JHO_CONFIG_HOME` environment variable if set and
 * non-empty; otherwise falls back to `<homedir>/.job-hunting-organizer`.
 *
 * No `--config-home` CLI flag is supported by design — the env var is
 * the only override.
 * @returns The absolute path to the config home.
 */
export function resolveConfigHome(): string {
  const envHome = process.env['JHO_CONFIG_HOME'];
  if (envHome !== undefined && envHome !== '') {
    return resolve(envHome);
  }
  return resolve(homedir(), DEFAULT_CONFIG_HOMEDIR);
}

/**
 * Resolve the default campaign name. The `JHO_DEFAULT_CAMPAIGN`
 * environment variable wins over the literal `'default'` so CI and
 * scripts can target a sandbox campaign without passing `--campaign`
 * to every invocation.
 *
 * Lives in `paths.ts` (not `config.ts`) so {@link resolveCampaignRoot}
 * can use it as a default without creating a circular import —
 * `config.ts` itself depends on `paths.ts`.
 * @returns The campaign name to use when none is specified.
 */
export function getDefaultCampaignName(): string {
  return process.env['JHO_DEFAULT_CAMPAIGN'] || 'default';
}

/**
 * Resolve the absolute path of a campaign's root directory.
 * @param campaignName - The campaign folder name. Default: the value of
 *   `JHO_DEFAULT_CAMPAIGN`, or `'default'`.
 * @returns `<dataRoot>/campaigns/<campaignName>`.
 */
export function resolveCampaignRoot(campaignName: string = getDefaultCampaignName()): string {
  const dataRoot = resolveDataRoot();
  return resolve(dataRoot, DEFAULT_CAMPAIGNS_DIRNAME, campaignName);
}

/**
 * Resolve the absolute path of the `config.json` file inside a root.
 * @param root - The root directory (global or campaign).
 * @returns The absolute path to the config file.
 */
export function resolveConfigPath(root: string): string {
  return resolve(root, DEFAULT_CONFIG_FILENAME);
}

/**
 * Resolve the absolute path of the `applied/` directory inside a root.
 * @param root - The root directory (global or campaign).
 * @returns The absolute path to the applied directory.
 */
export function resolveAppliedDir(root: string): string {
  return resolve(root, DEFAULT_APPLIED_DIRNAME);
}

/**
 * Resolve the absolute path of the `profile.md` file inside a root.
 * @param root - The root directory (global or campaign).
 * @returns The absolute path to the profile file.
 */
export function resolveProfilePath(root: string): string {
  return resolve(root, DEFAULT_PROFILE_FILENAME);
}

/**
 * Resolve the absolute path of the knowledge-base directory inside a root.
 * @param root - The root directory (global or campaign).
 * @returns The absolute path to the knowledge-base directory.
 */
export function resolveKnowledgeBaseDir(root: string): string {
  return resolve(root, DEFAULT_KNOWLEDGE_BASE_DIRNAME);
}

/**
 * Resolve the config file path and return it if the file exists.
 * @param root - The root directory (global or campaign) to look in.
 * @returns The absolute path to the config file, or `null` if missing.
 */
export async function findConfigPath(root: string): Promise<string | null> {
  const path = resolveConfigPath(root);
  if (await pathExists(path)) {
    return path;
  }
  return null;
}

/**
 * Ensure a directory exists, creating it (recursively) if it does not.
 * Used by `jho init` and `jho repair` to bootstrap the data layout.
 * @param root - The absolute path of the directory to ensure.
 */
export async function ensureRoot(root: string): Promise<void> {
  if (!(await pathExists(root))) {
    await mkdir(root, { recursive: true });
  }
}

/**
 * Whether `child` is located under `parent` in the filesystem tree.
 * Equality (same path) counts as "under". Comparison is done with
 * `path.relative` and is purely lexical — it does not check that the
 * paths exist.
 * @param child - The path to test.
 * @param parent - The path to test against.
 * @returns `true` if `child` is the same as `parent` or below it.
 */
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

/**
 * Walk up the current working directory looking for a folder whose name
 * matches {@link SLUG_PATTERN}, and that lives under `appliedDir`. Used
 * by CLI commands to infer the application slug from cwd when the user
 * didn't pass one explicitly.
 *
 * Returns `null` if the cwd is not under `appliedDir` or no matching
 * ancestor is found.
 * @param cwd - The current working directory (absolute or relative).
 * @param appliedDir - The absolute path of the campaign's `applied/`.
 * @returns The matched slug, or `null`.
 */
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

/**
 * Walk up from `cwd` looking for `<dataRoot>/campaigns/<name>`.
 * If found, return the campaign name. Used by `jho --campaign <name>`
 * cwd inference: if the user runs a command from inside
 * `<dataRoot>/campaigns/freelance/...`, the campaign is `freelance`.
 *
 * Returns `null` if `dataRoot` or its `campaigns/` subdir do not
 * exist, the cwd is not under `campaigns/`, or the path resolves to
 * the `campaigns/` dir itself.
 * @param cwd - The current working directory.
 * @param dataRoot - The absolute path of the campaign data root.
 * @returns The campaign folder name, or `null`.
 */
export function findCampaignFromCwd(cwd: string, dataRoot: string): string | null {
  if (!existsSync(dataRoot)) {
    return null;
  }
  const campaignsRoot = resolve(dataRoot, DEFAULT_CAMPAIGNS_DIRNAME);
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
