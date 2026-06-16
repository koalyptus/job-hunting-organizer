/**
 * Config schema migration infrastructure.
 *
 * ## How to bump the version
 *
 * When you make a **breaking change** to `GlobalConfigSchema` or
 * `CampaignConfigSchema` (remove/rename a field, change a type, make
 * an optional field required without a default):
 *
 * 1. Bump the constant in `config.schema.ts`:
 *    - `CURRENT_GLOBAL_CONFIG_VERSION` for global config changes
 *    - `CURRENT_CAMPAIGN_CONFIG_VERSION` for campaign config changes
 *
 * 2. Add a migration function here:
 *    - `GLOBAL_MIGRATIONS` for global config changes
 *    - `CAMPAIGN_MIGRATIONS` for campaign config changes
 *    The key is the **old** version number (the one you're migrating FROM).
 *    The function receives the raw JSON object and returns the migrated object.
 *
 * 3. The migration runner in `config.ts` runs all migrations in sequence
 *    from the stored version to the current version. No other code changes
 *    needed — `loadGlobalConfig` and `loadCampaignConfig` call it automatically.
 *
 * 4. Add a test in `tests/config.migrations.test.ts`.
 *
 * ## What does NOT need a version bump
 *
 * - Adding a new optional field with a `.default()` (Zod handles it)
 * - Adding a new field inside an existing `.object()` with a default
 * - Changing default values (no schema change)
 */

/**
 * Migration functions for global config. Key = old version number.
 * Each function transforms the raw JSON from version N to version N+1.
 * Migrations run in sequence: v1 → v2 → v3 → ...
 */
export const GLOBAL_MIGRATIONS = new Map<
  number,
  (old: Record<string, unknown>) => Record<string, unknown>
>([
  // Example (uncomment when you need v1 → v2):
  // [1, (old) => {
  //   const { removedField, ...rest } = old;
  //   return { ...rest, newField: 'default' };
  // }],
]);

/**
 * Migration functions for campaign config. Key = old version number.
 * Same contract as {@link GLOBAL_MIGRATIONS}.
 */
export const CAMPAIGN_MIGRATIONS = new Map<
  number,
  (old: Record<string, unknown>) => Record<string, unknown>
>([
  // Example (uncomment when you need v1 → v2):
  // [1, (old) => {
  //   const { removedField, ...rest } = old;
  //   return { ...rest, newField: 'default' };
  // }],
]);

/**
 * Run a sequence of migrations on a raw config object.
 * @param raw - The parsed JSON from disk (may have any version).
 * @param migrations - The migration map to apply.
 * @param currentVersion - The version the tool expects after all migrations.
 * @returns The migrated object with `version` set to `currentVersion`.
 * @throws If a migration function is missing for an intermediate version.
 */
export function runMigrations(
  raw: Record<string, unknown>,
  migrations: Map<number, (old: Record<string, unknown>) => Record<string, unknown>>,
  currentVersion: number,
): Record<string, unknown> {
  const storedVersion = typeof raw['version'] === 'number' ? raw['version'] : 1;

  if (storedVersion >= currentVersion) {
    return raw;
  }

  let result = { ...raw };

  for (let v = storedVersion; v < currentVersion; v++) {
    const migrate = migrations.get(v);
    if (!migrate) {
      throw new Error(
        `Config schema v${storedVersion} → v${currentVersion} migration failed: ` +
          `no migration function for v${v} → v${v + 1}. ` +
          `Delete the config file and re-run \`jho init\`.`,
      );
    }
    result = migrate(result);
    result['version'] = v + 1;
  }

  return result;
}
