/**
 * Options for {@link atomicWrite}. All fields are optional; defaults are
 * sensible (UTF-8, default file mode, no auto-mkdir).
 */
export interface AtomicWriteOptions {
  /** Encoding used to write the file. Default: `utf8`. */
  readonly encoding?: BufferEncoding;
  /** POSIX file mode bits. Ignored on Windows. Default: process umask. */
  readonly mode?: number;
  /** If `true`, create the parent directory if it does not exist. */
  readonly ensureDir?: boolean;
}

/**
 * Options for {@link withBackup}. The backup is created next to the
 * target file with a suffix appended to its name.
 */
export interface WithBackupOptions {
  /** Suffix to append to the backup filename. Default: `'.bak'`. */
  readonly backupSuffix?: string;
  /** Encoding used to read and write. Default: `utf8`. */
  readonly encoding?: BufferEncoding;
}

/**
 * Options accepted by {@link acquireLock}. All fields are optional and
 * map directly to `proper-lockfile`'s options.
 *
 * @see https://github.com/moxystudio/node-proper-lockfile
 */
export interface AcquireLockOptions {
  /** Number of acquisition attempts before giving up. Default: 5. */
  readonly retries?: number;
  /** Minimum backoff between retries, in ms. Default: 50. */
  readonly minTimeout?: number;
  /** Maximum backoff between retries, in ms. Default: 500. */
  readonly maxTimeout?: number;
  /** Stale-lock threshold, in ms. Locks older than this are reclaimed. */
  readonly stale?: number;
}

/**
 * Subset of fields read from the tool's own `package.json`. We don't
 * import `PackageJson` from `package.json` because Node types it loosely
 * and we only need a few fields.
 */
export interface PackageJson {
  /** Package name, e.g. `'job-hunting-organizer'`. */
  readonly name?: string;
  /** Semver string, e.g. `'0.1.0'`. */
  readonly version?: string;
  /** One-line description used in `--help` output. */
  readonly description?: string;
}

/**
 * Pino-compatible log levels. `silent` is included so users can disable
 * logging entirely via config.
 */
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

/**
 * Runtime configuration for the logger factory in `core/logger.ts`.
 */
export interface LoggerConfig {
  /** Minimum level to emit. */
  readonly level: LogLevel;
  /** Whether the destination is a TTY (controls pretty-print). */
  readonly isTty: boolean;
  /** Optional file path to also write logs to. */
  readonly file?: string | undefined;
  /** JSON paths whose values are replaced with `***` in log output. */
  readonly redactPaths: readonly string[];
  /** Optional correlation id stamped on every log line. */
  readonly correlationId?: string | undefined;
}

/**
 * Global configuration (per-user, stored at the config home). Holds the
 * settings that are *shared across every campaign* the user runs: the
 * LLM endpoint, GitHub identity, calendar provider, logging defaults,
 * and the location of the data root itself.
 *
 * Per-campaign paths (profile, CV, applied/, knowledge base/) live in
 * {@link CampaignConfig} — the global layer never sees them.
 */
export interface GlobalConfig {
  /** Schema version. Bumped on breaking changes to the config shape. */
  version: number;
  /**
   * Absolute path to the campaign data root (e.g.
   * `~/job-hunting-organizer-data/`). Distinct from the config home
   * where this file itself lives.
   */
  dataRoot: string;
  /** LLM provider settings (OpenAI-compatible). */
  llm: {
    /** Base URL of the API, e.g. `https://api.openai.com/v1`. */
    baseUrl: string;
    /** API key. Prefer setting the `LLM_API_KEY` env var instead. */
    apiKey: string;
    /** Model identifier, e.g. `gpt-4o-mini`. */
    model: string;
  };
  /** Optional GitHub integration for `jho campaign init` profile building. */
  github: {
    /** GitHub username. */
    user: string;
    /** Personal access token. Prefer the `GITHUB_TOKEN` env var. */
    token: string;
    /** Repos to mine for projects. Empty means "all public repos". */
    repos: string[];
  };
  /** Calendar integration (used by `jho interview schedule`). */
  calendar: {
    /** Provider key: `ics` (default) or `outlook`. */
    defaultProvider: string;
    /** Microsoft Graph settings (only used when `defaultProvider === 'outlook'`). */
    outlook: {
      /** Azure AD tenant id. */
      tenantId: string;
      /** App registration client id. */
      clientId: string;
      /** App registration client secret. Prefer the `MS_GRAPH_CLIENT_SECRET` env var. */
      clientSecret: string;
    };
  };
  /** Logging defaults. */
  logging: {
    /** Default level when `--verbose`/`--quiet` is not set. */
    level: LogLevel;
    /** Default log file path. Empty means "stderr only". */
    file: string;
    /** JSON paths to redact in addition to the built-in secret list. */
    redactPaths: string[];
  };
}

/**
 * Per-campaign configuration (stored at the campaign root). Holds the
 * paths that are unique to a single campaign: where its `profile.md`,
 * CV, `applied/`, and knowledge base live. The keys here are disjoint
 * from {@link GlobalConfig} — campaigns never override global fields.
 */
export interface CampaignConfig {
  /** Schema version. Mirrors `GlobalConfig.version` for consistency. */
  version: number;
  /** Per-campaign profile location. */
  profile: {
    /** Absolute path to this campaign's `profile.md`. */
    path: string;
  };
  /** Per-campaign CV location. */
  cv: {
    /** Absolute path to this campaign's CV (`.pdf` / `.docx` / `.md`). */
    path: string;
  };
  /** Per-campaign applications directory. */
  applied: {
    /** Absolute path to this campaign's `applied/` directory. */
    dir: string;
  };
  /** Per-campaign knowledge base directory. */
  knowledgeBase: {
    /** Absolute path to this campaign's knowledge-base directory. */
    dir: string;
  };
}

/**
 * Input shape for {@link buildSlug}. Every field is optional so the
 * caller can pass whatever they have; missing values fall back to
 * placeholders (`'unknown'`) or the current date.
 */
export interface SlugBuildInput {
  /** Job title (e.g. `"Senior Software Engineer"`). First 2-3 words become the role abbreviation. */
  title?: string | undefined;
  /** Company name (e.g. `"Nuage Technology Group"`). Lowercased and sanitized. */
  company?: string | undefined;
  /** Job URL. Used to extract a site-specific job id (LinkedIn, Seek, Indeed). */
  url?: string | undefined;
  /** Application date as ISO string or `Date`. Defaults to "now" (UTC). */
  appliedOn?: string | Date | undefined;
}

/**
 * Options for {@link buildSlug}. Reserved for future use (locale-specific
 * date formatting, custom sanitization rules, etc.). The `locale` field
 * is not yet wired up.
 */
export interface SlugOptions {
  /** Reserved for future use. */
  readonly locale?: string;
}
