import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { resolveGlobalRoot, resolveCampaignRoot, DEFAULT_CONFIG_FILENAME } from './paths.js';
import type { GlobalConfig, CampaignConfig } from './types.js';
import { GlobalConfigSchema, CampaignConfigSchema } from './config.schema.js';

// Cache for loaded configs to avoid repeated file reads
let _globalConfig: GlobalConfig | null = null;
const _campaignConfigCache: Map<string, CampaignConfig> = new Map();

// Load and validate global config
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
    // If file doesn't exist or is invalid JSON, start with defaults
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`Warning: Could not parse global config at ${configPath}:`, err);
    }
    rawConfig = {};
  }

  const parsed = GlobalConfigSchema.parse(rawConfig);
  _globalConfig = parsed;
  return _globalConfig;
}

// Load and validate campaign config
export function loadCampaignConfig(campaignName: string): CampaignConfig {
  const cacheKey = campaignName;
  if (_campaignConfigCache.has(cacheKey)) {
    return _campaignConfigCache.get(cacheKey)!;
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

// Get merged configuration (global + campaign)
export function getConfig(campaignName: string = 'default'): {
  global: GlobalConfig;
  campaign: CampaignConfig;
  merged: GlobalConfig & Partial<CampaignConfig>;
} {
  const global = loadGlobalConfig();
  const campaign = loadCampaignConfig(campaignName);

  // Merge campaign over global (campaign wins)
  // Only merge fields that exist in both configs (CampaignConfig has subset of GlobalConfig fields)
  const merged = {
    ...global,
    version: campaign.version ?? global.version,
    profile: { ...global.profile, ...campaign.profile },
    applied: { ...global.applied, ...campaign.applied },
    knowledgeBase: { ...global.knowledgeBase, ...campaign.knowledgeBase },
  } as GlobalConfig & Partial<CampaignConfig>;

  return { global, campaign, merged };
}

// Update global config (partial update)
export function updateGlobalConfig(update: Partial<GlobalConfig>): void {
  const current = loadGlobalConfig();
  const updated = { ...current, ...update };
  GlobalConfigSchema.parse(updated); // validate

  const globalRoot = resolveGlobalRoot();
  const configPath = resolve(globalRoot, DEFAULT_CONFIG_FILENAME);

  // Ensure directory exists
  mkdirSync(dirname(configPath), { recursive: true });

  writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf8');

  // Clear cache
  _globalConfig = null;
}

// Update campaign config (partial update)
export function updateCampaignConfig(campaignName: string, update: Partial<CampaignConfig>): void {
  const current = loadCampaignConfig(campaignName);
  const updated = { ...current, ...update };
  CampaignConfigSchema.parse(updated); // validate

  const campaignRoot = resolveCampaignRoot(campaignName);
  const configPath = resolve(campaignRoot, DEFAULT_CONFIG_FILENAME);

  // Ensure directory exists
  mkdirSync(dirname(configPath), { recursive: true });

  writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf8');

  // Clear cache for this campaign
  _campaignConfigCache.delete(campaignName);
}

// Clear all caches (useful for testing)
export function clearConfigCache(): void {
  _globalConfig = null;
  _campaignConfigCache.clear();
}

// Get the default campaign name (can be overridden by env var or CLI flag)
export function getDefaultCampaignName(): string {
  return process.env['JHO_DEFAULT_CAMPAIGN'] || 'default';
}
