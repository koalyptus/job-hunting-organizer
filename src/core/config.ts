import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { resolveGlobalRoot, resolveCampaignRoot, DEFAULT_CONFIG_FILENAME } from './paths.js';
import type { GlobalConfig, CampaignConfig } from './types.js';
import { GlobalConfigSchema, CampaignConfigSchema } from './config.schema.js';

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
 * `<globalRoot>/<DEFAULT_CONFIG_FILENAME>`. The result is cached
 * process-wide; call {@link clearConfigCache} to invalidate.
 *
 * On `ENOENT` the file is treated as an empty config and the schema
 * defaults are applied. On any other read/parse error a one-shot
 * warning is written to stderr and an empty config is also used — the
 * tool prefers to start up with a known-good defaults shape rather
 * than crash, so individual commands can re-surfacing the problem
 * through `jho doctor`.
 * @returns The parsed (and defaulted) global config.
 */
export function loadGlobalConfig(): GlobalConfig {
  if (_globalConfig !== null) {
    return _globalConfig;
  }

  const globalRoot = resolveGlobalRoot();
  const configPath = resolve(globalRoot, DEFAULT_CONFIG_FILENAME);

  let rawConfig: Record<string, unknown> = {};
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
 * `<campaignRoot>/<DEFAULT_CONFIG_FILENAME>`. Cached per campaign.
 * Same fallback rules as {@link loadGlobalConfig}: missing file →
 * empty object → schema defaults; other read/parse errors warn and
 * continue with defaults.
 * @param campaignName - The campaign identifier (folder name under
 *   `<globalRoot>/campaigns/`).
 * @returns The parsed campaign config.
 */
export function loadCampaignConfig(campaignName: string): CampaignConfig {
  const cacheKey = campaignName;
  if (_campaignConfigCache.has(cacheKey)) {
    return _campaignConfigCache.get(cacheKey) as CampaignConfig;
  }

  const campaignRoot = resolveCampaignRoot(campaignName);
  const configPath = resolve(campaignRoot, DEFAULT_CONFIG_FILENAME);

  let rawConfig: Record<string, unknown> = {};
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
 * Load global + campaign configs and return the three views the rest
 * of the tool needs: each layer on its own plus a shallow-merged
 * object where the campaign wins on the fields it owns (`version`,
 * `profile`, `applied`, `knowledgeBase`). Other global fields pass
 * through untouched.
 * @param campaignName - The campaign to merge on top of the global
 *   config. Defaults to `'default'`, which is also the campaign
 *   auto-created on first `jho init`.
 * @returns The two source configs and the merged view.
 */
export function getConfig(campaignName: string = 'default'): {
  global: GlobalConfig;
  campaign: CampaignConfig;
  merged: GlobalConfig & Partial<CampaignConfig>;
} {
  const global = loadGlobalConfig();
  const campaign = loadCampaignConfig(campaignName);

  const merged = {
    ...global,
    version: campaign.version ?? global.version,
    profile: { ...global.profile, ...campaign.profile },
    applied: { ...global.applied, ...campaign.applied },
    knowledgeBase: { ...global.knowledgeBase, ...campaign.knowledgeBase },
  } as GlobalConfig & Partial<CampaignConfig>;

  return { global, campaign, merged };
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

  const globalRoot = resolveGlobalRoot();
  const configPath = resolve(globalRoot, DEFAULT_CONFIG_FILENAME);

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
  const configPath = resolve(campaignRoot, DEFAULT_CONFIG_FILENAME);

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

/**
 * Resolve the default campaign name. The
 * `JHO_DEFAULT_CAMPAIGN` environment variable wins over the literal
 * `'default'` so CI / scripting can target a sandbox campaign
 * without passing `--campaign` to every invocation.
 * @returns The campaign name to use when none is specified.
 */
export function getDefaultCampaignName(): string {
  return process.env['JHO_DEFAULT_CAMPAIGN'] || 'default';
}
