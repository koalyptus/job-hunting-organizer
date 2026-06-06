import { getConfig, loadGlobalConfig } from './config.js';
import { resolveGlobalRoot, resolveCampaignRoot, DEFAULT_CONFIG_FILENAME } from './paths.js';
import type { GlobalConfig } from './types.js';

/**
 * Paths in the merged config that hold secrets. The value at each path
 * is replaced by {@link REDACTION_MARKER} unless the user passes
 * `--reveal`. The `envVar` field appears in the replacement string so
 * the user can recover by setting the variable.
 */
const SECRET_PATHS: ReadonlyArray<{ path: readonly string[]; envVar: string }> = [
  { path: ['llm', 'apiKey'], envVar: 'LLM_API_KEY' },
  { path: ['github', 'token'], envVar: 'GITHUB_TOKEN' },
  { path: ['calendar', 'outlook', 'clientSecret'], envVar: 'MS_GRAPH_CLIENT_SECRET' },
];

/** The string substituted for secret values in `jho config show` output. */
const REDACTION_MARKER = '***';

/**
 * Return a deep clone of `config` with secret values replaced by a
 * redaction marker that names the environment variable the user should
 * set. Uses {@link structuredClone} so nested objects, arrays, and
 * dates are duplicated without sharing references with the caller.
 * @param config - The config to redact.
 * @returns A new `GlobalConfig` safe to print to a TTY or log line.
 */
export function redactSecrets(config: GlobalConfig): GlobalConfig {
  const out = structuredClone(config);
  for (const { path, envVar } of SECRET_PATHS) {
    setAtPath(out, path, `${REDACTION_MARKER} (set ${envVar})`);
  }
  return out;
}

/**
 * Set `value` at the given path in a nested object, mutating it in
 * place. Walks `path[0..n-2]` and aborts silently if any intermediate
 * step is missing or non-object — secrets may be absent from a
 * minimal config, which is fine to leave alone.
 * @param obj - The object to mutate. Usually the cloned result of
 *   {@link redactSecrets}.
 * @param path - The key path. Empty paths are ignored.
 * @param value - The value to set at the leaf.
 */
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

/**
 * Options for {@link renderConfigShow} and {@link configShowPaths}.
 */
export interface ConfigShowOptions {
  /**
   * When `true`, show the global config only (no campaign merge, no
   * campaign path in the header).
   */
  readonly global?: boolean;
  /**
   * When `true`, show secret values verbatim. Default: secrets are
   * replaced by a redaction marker.
   */
  readonly reveal?: boolean;
  /**
   * When `true`, emit JSON without a header comment. Used so stdout
   * is pipeable to `jq`.
   */
  readonly json?: boolean;
}

/**
 * The on-disk paths the header of `jho config show` should reference.
 */
export interface ConfigShowPaths {
  /** Absolute path to the global `config.json`. */
  readonly global: string;
  /**
   * Absolute path to the active campaign's `config.json`, or `null`
   * when `options.global === true` (no campaign is involved).
   */
  readonly campaign: string | null;
}

/**
 * Compute the on-disk paths that `jho config show` will reference in
 * its header. Pure: only the global root and campaign root resolvers
 * touch the filesystem conceptually — the paths themselves are
 * deterministic.
 * @param options - Same shape as {@link ConfigShowOptions}; only
 *   `global` is consulted.
 * @returns The two (or one) absolute config paths.
 */
export function configShowPaths(options: ConfigShowOptions = {}): ConfigShowPaths {
  const isGlobal = options.global === true;
  return {
    global: `${resolveGlobalRoot()}/${DEFAULT_CONFIG_FILENAME}`,
    campaign: isGlobal ? null : `${resolveCampaignRoot()}/${DEFAULT_CONFIG_FILENAME}`,
  };
}

/**
 * Format the stderr path hint for `jho config show`. Always ends with
 * a newline. Two lines are emitted when a campaign path is present,
 * column-aligned with the same width as `jho config show`'s header.
 * @param paths - The on-disk paths, usually from
 *   {@link configShowPaths}.
 * @returns A multi-line string safe to write to stderr.
 */
export function formatPathHint(paths: ConfigShowPaths): string {
  if (paths.campaign === null) {
    return `config: ${paths.global}\n`;
  }
  return `config:    ${paths.global}\ncampaign:  ${paths.campaign}\n`;
}

/**
 * Render the body of `jho config show` (i.e. everything that goes to
 * stdout). The CLI writes this to stdout and calls
 * {@link formatPathHint} for the matching stderr hint.
 *
 * Format: with `{ json: true }`, a pretty-printed JSON value with no
 * header. Without `json`, a `# Global` or `# Merged` header on top
 * (so the same payload is self-describing when saved to a file).
 * Secrets are redacted unless `reveal` is set.
 * @param options - View + redaction flags.
 * @returns The rendered output, always terminated with a newline.
 */
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

/**
 * Build the `#` comment block that prefixes the non-JSON output of
 * {@link renderConfigShow}. Distinguishes global from merged, names
 * the source file(s) the value was loaded from.
 * @param paths - The on-disk paths, usually from
 *   {@link configShowPaths}.
 * @param isGlobal - When `true`, the header says "Global" and only
 *   the global path is shown.
 * @returns A multi-line header, each line starting with `# ` and
 *   terminated with `\n`.
 */
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
