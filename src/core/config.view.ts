import { getConfig, loadGlobalConfig } from './config.js';
import { resolveGlobalRoot, resolveCampaignRoot, DEFAULT_CONFIG_FILENAME } from './paths.js';
import type { GlobalConfig } from './types.js';

// Paths in the merged config that hold secrets. We replace their values
// with a redaction marker that hints at the env var the user should set.
const SECRET_PATHS: ReadonlyArray<{ path: readonly string[]; envVar: string }> = [
  { path: ['llm', 'apiKey'], envVar: 'LLM_API_KEY' },
  { path: ['github', 'token'], envVar: 'GITHUB_TOKEN' },
  { path: ['calendar', 'outlook', 'clientSecret'], envVar: 'MS_GRAPH_CLIENT_SECRET' },
];

const REDACTION_MARKER = '***';

export function redactSecrets(config: GlobalConfig): GlobalConfig {
  const out = structuredClone(config);
  for (const { path, envVar } of SECRET_PATHS) {
    setAtPath(out, path, `${REDACTION_MARKER} (set ${envVar})`);
  }
  return out;
}

function setAtPath(obj: unknown, path: readonly string[], value: unknown): void {
  if (path.length === 0) {
    return;
  }
  let cur: unknown = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (typeof cur !== 'object' || cur === null) {
      return;
    }
    cur = (cur as Record<string, unknown>)[path[i] ?? ''];
  }
  if (typeof cur !== 'object' || cur === null) {
    return;
  }
  (cur as Record<string, unknown>)[path[path.length - 1] ?? ''] = value;
}

export interface ConfigShowOptions {
  readonly global?: boolean;
  readonly reveal?: boolean;
  readonly json?: boolean;
}

export interface ConfigShowPaths {
  /** Absolute path to the global config.json. */
  readonly global: string;
  /**
   * Absolute path to the active campaign's config.json, or null when
   * `options.global === true` (no campaign is involved).
   */
  readonly campaign: string | null;
}

export function configShowPaths(options: ConfigShowOptions = {}): ConfigShowPaths {
  const isGlobal = options.global === true;
  return {
    global: `${resolveGlobalRoot()}/${DEFAULT_CONFIG_FILENAME}`,
    campaign: isGlobal ? null : `${resolveCampaignRoot()}/${DEFAULT_CONFIG_FILENAME}`,
  };
}

// Format the path(s) for the stderr hint. Always ends with a newline.
export function formatPathHint(paths: ConfigShowPaths): string {
  if (paths.campaign === null) {
    return `config: ${paths.global}\n`;
  }
  return `config:    ${paths.global}\ncampaign:  ${paths.campaign}\n`;
}

export function renderConfigShow(options: ConfigShowOptions = {}): string {
  const isGlobal = options.global === true;
  const reveal = options.reveal === true;
  const asJson = options.json === true;

  const source = isGlobal ? loadGlobalConfig() : getConfig().merged;
  const value = reveal ? source : redactSecrets(source);
  const paths = configShowPaths(options);

  if (asJson) {
    return `${JSON.stringify(value, null, 2)}\n`;
  }
  return `${formatHeaderComment(paths, isGlobal)}${JSON.stringify(value, null, 2)}\n`;
}

function formatHeaderComment(paths: ConfigShowPaths, isGlobal: boolean): string {
  const kind = isGlobal ? 'Global' : 'Merged';
  const note = isGlobal
    ? 'campaign fields not included'
    : 'global + active campaign; campaign wins on shared fields';
  const source =
    isGlobal || paths.campaign === null
      ? `Source: ${paths.global}`
      : `Source: ${paths.global}\n# Campaign: ${paths.campaign}`;
  return `# ${kind} config (${note})\n# ${source}\n`;
}
