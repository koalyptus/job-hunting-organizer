import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  resolveConfigHome,
  resolveCampaignRoot,
  resolveConfigPath,
  getDefaultCampaignName,
} from './paths.js';
import type { GlobalConfig, CampaignConfig } from './types.js';
import { GlobalConfigSchema, CampaignConfigSchema } from './config.schema.js';

// Re-export for callers that import `getDefaultCampaignName` from
// `./config.js`. The canonical definition lives in `./paths.ts` so
// `resolveCampaignRoot` can use it as a default without a circular
// import.
export { getDefaultCampaignName };

/**
 * Module-level cache for the loaded global config. Populated lazily by
 * {@link loadGlobalConfig} and invalidated by
 * {@link updateGlobalConfig} and {@link clearConfigCache}. Holding a
 * process-wide singleton is fine because config is read-mostly and the
 * tool runs as a single short-lived process per CLI invocation.
 */
let _globalConfig: GlobalConfig | null = null;

/**
 * Per-campaign cache for loaded campaign configs. Keyed by campaign
 * name. Invalidated by {@link updateCampaignConfig} (per key) and
 * {@link clearConfigCache} (all).
 */
const _campaignConfigCache: Map<string, CampaignConfig> = new Map();

/**
 * Load and validate the global config from
 * `<configHome>/config.json`. The result is cached
 * process-wide; call {@link clearConfigCache} to invalidate.
 *
 * On `ENOENT` the file is treated as an empty config and the schema
 * defaults are applied. On any other read/parse error a one-shot
 * warning is written to stderr and an empty config is also used — the
 * tool prefers to start up with a known-good defaults shape rather
 * than crash, so individual commands can re-surface the problem
 * through `jho doctor`.
 * @returns The parsed (and defaulted) global config.
 */
export function loadGlobalConfig(): GlobalConfig {
  if (_globalConfig !== null) {
    return _globalConfig;
  }

  const configHome = resolveConfigHome();
  const configPath = resolveConfigPath(configHome);

  let rawConfig: unknown = {};
  try {
    const configContent = readFileSync(configPath, 'utf8');
    rawConfig = JSON.parse(configContent);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`Warning: Could not parse global config at ${configPath}:`, err);
    }
    rawConfig = {};
  }

  const parsed = GlobalConfigSchema.parse(rawConfig);
  _globalConfig = parsed;
  return _globalConfig;
}

/**
 * Load and validate the campaign config for `campaignName` from
 * `<campaignRoot>/config.json`. Cached per campaign.
 * Same fallback rules as {@link loadGlobalConfig}: missing file →
 * empty object → schema defaults; other read/parse errors warn and
 * continue with defaults.
 * @param campaignName - The campaign identifier (folder name under
 *   `<dataRoot>/campaigns/`).
 * @returns The parsed campaign config.
 */
export function loadCampaignConfig(campaignName: string): CampaignConfig {
  const cacheKey = campaignName;
  if (_campaignConfigCache.has(cacheKey)) {
    return _campaignConfigCache.get(cacheKey) as CampaignConfig;
  }

  const campaignRoot = resolveCampaignRoot(campaignName);
  const configPath = resolveConfigPath(campaignRoot);

  let rawConfig: unknown = {};
  try {
    const configContent = readFileSync(configPath, 'utf8');
    rawConfig = JSON.parse(configContent);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`Warning: Could not parse campaign config at ${configPath}:`, err);
    }
    rawConfig = {};
  }

  const parsed = CampaignConfigSchema.parse(rawConfig);
  _campaignConfigCache.set(cacheKey, parsed);
  return parsed;
}

/**
 * Load both config layers and return them separately.
 *
 * The global and campaign keys are disjoint by design — the campaign
 * layer never overrides a global field; it only adds per-campaign
 * paths. Callers that need a single object can do
 * `{ ...global, ...campaign }` themselves; the result is not exposed
 * here because the intersection type can't be expressed without a
 * type lie (`as` cast), and the merge is trivial enough that callers
 * should own it.
 * @param campaignName - The campaign to load. Defaults to `'default'`,
 *   which is also the campaign auto-created on first
 *   `jho campaign init`.
 * @returns The two source configs.
 */
export function getConfig(campaignName: string = 'default'): {
  global: GlobalConfig;
  campaign: CampaignConfig;
} {
  const global = loadGlobalConfig();
  const campaign = loadCampaignConfig(campaignName);

  return { global, campaign };
}

/**
 * Shallow-merge `update` into the current global config, validate the
 * result, ensure the parent directory exists, then write the new
 * config atomically via {@link writeFileSync} (overwrite-in-place;
 * the global config is small and lives outside the per-app lock
 * domain). The global cache is invalidated on success.
 *
 * Throws if the merged object fails `GlobalConfigSchema.parse` —
 * callers should let it bubble so `jho config` shows a clear error.
 * @param update - Partial fields to merge over the current config.
 */
export function updateGlobalConfig(update: Partial<GlobalConfig>): void {
  const current = loadGlobalConfig();
  const updated = { ...current, ...update };
  GlobalConfigSchema.parse(updated);

  const globalRoot = resolveConfigHome();
  const configPath = resolveConfigPath(globalRoot);

  mkdirSync(dirname(configPath), { recursive: true });

  writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf8');

  _globalConfig = null;
}

/**
 * Shallow-merge `update` into the current campaign config, validate,
 * write to disk, and invalidate this campaign's cache entry. Same
 * semantics as {@link updateGlobalConfig} but scoped to one campaign.
 * @param campaignName - The campaign whose config to update.
 * @param update - Partial fields to merge over the current config.
 */
export function updateCampaignConfig(campaignName: string, update: Partial<CampaignConfig>): void {
  const current = loadCampaignConfig(campaignName);
  const updated = { ...current, ...update };
  CampaignConfigSchema.parse(updated);

  const campaignRoot = resolveCampaignRoot(campaignName);
  const configPath = resolveConfigPath(campaignRoot);

  mkdirSync(dirname(configPath), { recursive: true });

  writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf8');

  _campaignConfigCache.delete(campaignName);
}

/**
 * Drop both caches. Used by tests and by the in-process path that
 * runs `jho config` updates so subsequent reads see the on-disk
 * truth. The MCP server should call this after every `update_config`
 * tool call (handled by the server, not the core layer).
 */
export function clearConfigCache(): void {
  _globalConfig = null;
  _campaignConfigCache.clear();
}
