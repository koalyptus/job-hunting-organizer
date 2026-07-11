import { z } from 'zod';
import { resolveDataRoot } from '../paths.js';
import { ALL_LOG_LEVELS, type LogLevel } from '../types.js';

/**
 * Current version of the global config schema. Bumped on any
 * backwards-incompatible change to the global schema below.
 *
 * **How to bump (after v1.0):**
 * 1. Increment this constant.
 * 2. Add a migration function in `config.migrations.ts` → `GLOBAL_MIGRATIONS`
 *    with key = old version number. The function transforms raw JSON vN → vN+1.
 * 3. Add a test in `tests/config.migrations.test.ts`.
 * 4. No other code changes needed — `loadGlobalConfig` runs migrations automatically.
 *
 * **Pre-1.0:** Breaking changes are permitted freely. Users re-init.
 */
export const CURRENT_GLOBAL_CONFIG_VERSION = 1;

/**
 * Current version of the per-campaign config schema. See
 * {@link CURRENT_GLOBAL_CONFIG_VERSION} for the maintenance story
 * (global and campaign schemas follow the same policy).
 */
export const CURRENT_CAMPAIGN_CONFIG_VERSION = 1;

/**
 * Common error message for a version mismatch. Centralised so the
 * wording (and the "what to do about it" guidance) lives in one place.
 * @param expected - The current version the build expects.
 */
function versionMismatchMessage(expected: number): string {
  return (
    `Config schema v${expected} expected; this file declares a different version. ` +
    `This usually means a migration function is missing in config.migrations.ts. ` +
    `Delete the config file and re-run \`jho init\`, or add the missing migration.`
  );
}

/**
 * Zod schema for `<configHome>/config.json`. The parsed result is
 * always fully populated — every nested object has a `.default(...)`
 * so a missing or partial file still yields a known-good shape.
 *
 * Defaults are chosen for the common Ollama setup (local, no auth)
 * because that is the lowest-friction starting point. The fields here
 * are the ones that are genuinely *global* (shared across every
 * campaign a user runs): the LLM endpoint, GitHub identity, calendar
 * provider, logging, and the location of the data root itself.
 *
 * Per-campaign fields (profile, CV, applied, knowledge base) belong
 * in {@link CampaignConfigSchema} — they vary by campaign and live
 * next to the campaign's other files in the data root.
 *
 * Note: this file lives in the config home (see `AGENTS.md` "Data
 * layout"), which is a *separate* location from the data root
 * described by the `dataRoot` field below.
 */
export const GlobalConfigSchema = z.object({
  /**
   * Schema version. Must equal {@link CURRENT_GLOBAL_CONFIG_VERSION}
   * exactly — see that constant for the maintenance story. A missing
   * `version` field falls back to the current value via `.default(...)`
   * (Zod defaults short-circuit validation), so fresh files pass
   * without a literal on disk.
   */
  version: z
    .number()
    .int()
    .refine((v) => v === CURRENT_GLOBAL_CONFIG_VERSION, {
      message: versionMismatchMessage(CURRENT_GLOBAL_CONFIG_VERSION),
    })
    .default(CURRENT_GLOBAL_CONFIG_VERSION),
  /**
   * Absolute path of the campaign data root. Computed lazily on each
   * parse via {@link resolveDataRoot} so the value tracks `$JHO_DATA`
   * / `~/job-hunting-organizer-data/` without being frozen at module
   * load time. This means tests that set `JHO_DATA` after the schema
   * module has been imported still see the env var at parse time.
   *
   * This describes where the user's working data lives, which is
   * distinct from the config home that holds this file.
   */
  dataRoot: z.string().default(() => resolveDataRoot()),
  /** OpenAI-compatible LLM endpoint settings. Shared across campaigns. */
  llm: z
    .object({
      baseUrl: z.string().url().default('http://localhost:11434/v1'),
      apiKey: z.string().default('no-key'),
      model: z.string().default('llama3.1'),
      /** Per-request timeout in milliseconds for LLM calls (default 20min). Increase for slow local models. */
      timeoutMs: z.number().int().min(30_000).max(3_600_000).default(1_200_000),
    })
    .default({
      baseUrl: 'http://localhost:11434/v1',
      apiKey: 'no-key',
      model: 'llama3.1',
      timeoutMs: 1_200_000,
    }),
  /**
   * Optional GitHub integration for `jho campaign init` profile
   * building. One identity, shared across campaigns.
   */
  github: z
    .object({
      user: z.string().default(''),
      token: z.string().default(''),
      repos: z.array(z.string()).default([]),
    })
    .default({ user: '', token: '', repos: [] }),
  /**
   * Fetch settings for JD extraction. `timeoutMs` controls how long
   * each HTTP request waits before aborting (default 30s). Increase
   * for slow sites or Cloudflare-challenged pages.
   */
  fetch: z
    .object({
      timeoutMs: z.number().int().min(5_000).max(120_000).default(30_000),
    })
    .default({ timeoutMs: 30_000 }),
  /** Calendar integration. ICS is the zero-config default. */
  calendar: z
    .object({
      defaultProvider: z.enum(['ics', 'outlook', 'none']).default('ics'),
      outlook: z
        .object({
          tenantId: z.string().default(''),
          clientId: z.string().default(''),
          clientSecret: z.string().default(''),
        })
        .default({ tenantId: '', clientId: '', clientSecret: '' }),
    })
    .default({
      defaultProvider: 'ics',
      outlook: { tenantId: '', clientId: '', clientSecret: '' },
    }),
  /**
   * Logging knobs. `redactPaths` mirrors the secrets the logger must
   * mask before writing to disk; the user can extend the list to
   * cover custom secret fields without forking.
   */
  logging: z
    .object({
      level: z.enum(ALL_LOG_LEVELS as [LogLevel, ...LogLevel[]]).default('info'),
      disableFileLogging: z.boolean().default(false),
      file: z.string().optional(),
      redactPaths: z
        .array(z.string())
        .default([
          '*.apiKey',
          '*.token',
          '*.clientSecret',
          '*.password',
          '*.secret',
          'config.llm.apiKey',
          'config.github.token',
          'config.calendar.outlook.clientSecret',
        ]),
    })
    .default({
      level: 'info',
      disableFileLogging: false,
      redactPaths: [
        '*.apiKey',
        '*.token',
        '*.clientSecret',
        '*.password',
        '*.secret',
        'config.llm.apiKey',
        'config.github.token',
        'config.calendar.outlook.clientSecret',
      ],
    }),
});

/**
 * Zod schema for `<dataRoot>/campaigns/<name>/config.json`. Holds the
 * fields that vary per campaign: where the profile, CV, applied
 * directory, and knowledge base live for *this* campaign. The keys
 * here are disjoint from {@link GlobalConfigSchema} — the global
 * layer never sees these.
 *
 * Missing or partial files yield a fully-defaulted object, same as
 * the global schema.
 */
export const CampaignConfigSchema = z.object({
  /**
   * Schema version. Must equal {@link CURRENT_CAMPAIGN_CONFIG_VERSION}
   * exactly — see that constant for the maintenance story. Same
   * default-fallback behavior as the global config's `version` field.
   */
  version: z
    .number()
    .int()
    .refine((v) => v === CURRENT_CAMPAIGN_CONFIG_VERSION, {
      message: versionMismatchMessage(CURRENT_CAMPAIGN_CONFIG_VERSION),
    })
    .default(CURRENT_CAMPAIGN_CONFIG_VERSION),
  /** Per-campaign profile location. */
  profile: z
    .object({
      path: z.string().default(''),
    })
    .default({ path: '' }),
  /** Per-campaign CV location. */
  cv: z
    .object({
      path: z.string().default(''),
    })
    .default({ path: '' }),
  /** Per-campaign LinkedIn profile. */
  linkedin: z
    .object({
      url: z.string().default(''),
    })
    .default({ url: '' }),
  /** Per-campaign applications directory. */
  applied: z
    .object({
      dir: z.string().default(''),
    })
    .default({ dir: '' }),
  /** Per-campaign knowledge base directory. */
  knowledgeBase: z
    .object({
      dir: z.string().default(''),
    })
    .default({ dir: '' }),
});
