/**
 * Paths in the global config that hold secrets. The value at each
 * path is replaced by {@link REDACTION_MARKER} unless the caller
 * passes `reveal: true`. The `envVar` field appears in the
 * replacement string so the user can recover by setting the variable.
 *
 * The campaign config carries no secrets, so the paths here only
 * apply when redaction runs on a global config. The generic
 * {@link redactSecrets} still works on a campaign config because the
 * `setAtPath` walker silently aborts on missing branches.
 *
 * Exported (not just module-private) so `core/logger.ts` can derive
 * its default redaction paths from the same source — single source
 * of truth for "where do secrets live".
 */
export const SECRET_PATHS: ReadonlyArray<{ path: readonly string[]; envVar: string }> = [
  { path: ['llm', 'apiKey'], envVar: 'LLM_API_KEY' },
  { path: ['github', 'token'], envVar: 'GITHUB_TOKEN' },
  { path: ['calendar', 'outlook', 'clientSecret'], envVar: 'MS_GRAPH_CLIENT_SECRET' },
];

/** The string substituted for secret values when `reveal` is `false`. */
const REDACTION_MARKER = '***';

/**
 * Return a deep clone of `config` with secret values replaced by a
 * redaction marker that names the environment variable the user should
 * set. Uses {@link structuredClone} so nested objects, arrays, and
 * dates are duplicated without sharing references with the caller.
 *
 * Generic over `T` because the secret paths are absolute
 * (`llm.apiKey`, etc.) and a campaign config that happens to lack
 * those branches is a no-op — the function silently skips missing
 * paths. This lets `renderConfig` call it on either the global or
 * campaign config without a cast.
 * @param config - The config to redact.
 * @returns A new object with the same shape as `config`, safe to print.
 */
export function redactSecrets<T>(config: T): T {
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
