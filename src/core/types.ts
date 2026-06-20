import type { paths } from '@octokit/openapi-types';

/** Supported calendar providers. */
export type CalendarProvider = 'ics' | 'outlook' | 'none';

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
 * LLM provider settings used by {@link chatComplete}. Derived from the
 * global config's `llm` block with env-var overrides.
 */
export interface LlmConfig {
  /** Base URL of the API, e.g. `https://api.openai.com/v1`. */
  readonly baseUrl: string;
  /** API key. Prefer setting the `LLM_API_KEY` env var. */
  readonly apiKey: string;
  /** Model identifier, e.g. `gpt-4o-mini`. */
  readonly model: string;
}

/**
 * Supported CV file formats for {@link readCv}.
 */
export type CvFormat = 'pdf' | 'docx' | 'text';

/**
 * Result of a successful {@link readCv} call.
 */
export interface CvContent {
  /** Plain text extracted from the CV file. */
  readonly text: string;
  /** Detected format based on file extension. */
  readonly format: CvFormat;
  /** Original file name (basename only). */
  readonly fileName: string;
}

/**
 * A single target role entry from the `## Target roles` section of
 * `profile.md`. Each role is an H3 heading with a slug, title, and
 * priority tag, followed by bullet-point fields.
 */
export interface TargetRole {
  /** Stable identifier (lowercase, alphanumeric + hyphens). Used in `meta.md` `targetRole`. */
  readonly slug: string;
  /** Display title (e.g. `"Senior Backend Engineer"`). */
  readonly title: string;
  /** Priority: `primary` (main focus), `secondary` (open to), or `stretch` (aspirational). */
  readonly priority: 'primary' | 'secondary' | 'stretch';
  /** Freeform level (e.g. `"Senior (IC4)"`, `"Staff"`, `"M3"`). */
  readonly level: string;
  /** Comma-separated domain keywords (e.g. `"Backend, distributed systems"`). */
  readonly domain: string;
  /** Comma-separated tech keywords (e.g. `"TypeScript, Node.js, PostgreSQL"`). */
  readonly stack: string;
  /** Work arrangement (e.g. `"Remote or hybrid (Sydney timezone)"`). */
  readonly workStyle: string;
  /** Compensation lower bound (e.g. `"160k AUD"`). */
  readonly compensation: string;
  /** Freeform notes about the role. */
  readonly notes: string;
}

/**
 * Options for {@link chatComplete}. All fields are optional.
 */
export interface ChatCompleteOptions {
  /** Sampling temperature (0–2). Default: `0.6`. */
  readonly temperature?: number;
  /** Maximum tokens to generate. Default: model-specific cap. */
  readonly maxTokens?: number;
  /** Request structured JSON output (`response_format: { type: 'json_object' }`). */
  readonly jsonMode?: boolean;
  /** AbortSignal for cancellation. */
  readonly signal?: AbortSignal;
  /** Request timeout in milliseconds. Default: `120_000`. */
  readonly timeout?: number;
  /** Max retries on transient errors (429, 5xx, network). Default: `0`. */
  readonly maxRetries?: number;
}

/**
 * Result of a successful {@link chatComplete} call.
 */
export interface ChatCompleteResult {
  /** The generated text content (empty string if the model refused or returned nothing). */
  readonly content: string;
  /** The model identifier that produced the response. */
  readonly model: string;
  /** Token usage from the API response. */
  readonly usage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
  };
  /** How the model stopped generating: `stop`, `length`, `content_filter`, `tool_calls`, `function_call`, or `null`. */
  readonly finishReason: string | null;
  /** Wall-clock duration of the request in milliseconds. */
  readonly durationMs: number;
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
    defaultProvider: CalendarProvider;
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
  /** Per-campaign LinkedIn profile. */
  linkedin: {
    /** LinkedIn profile URL (e.g. `https://linkedin.com/in/username`). */
    url: string;
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

/**
 * A flat mapping of frontmatter keys to YAML-decoded values. Custom
 * user fields are preserved on round-trip; see `mergeFrontmatter` in
 * `core/frontmatter.ts`.
 */
export interface Frontmatter {
  [key: string]: unknown;
}

/**
 * The two halves of a file with a YAML frontmatter block. Returned by
 * `parseFrontmatter` and `readFrontmatter` in `core/frontmatter.ts`.
 */
export interface ParsedFile {
  /** Decoded YAML mapping, or `{}` if the file has no frontmatter. */
  frontmatter: Frontmatter;
  /** The body text after the closing `---` line. May be empty. */
  body: string;
}

/**
 * Known region names emitted by the in-file marker system (see
 * `core/markers.ts`). Kept here as a literal union so type-level
 * narrowing doesn't require importing the runtime
 * `REGION_MARKER_NAMES` constant. **Must stay in sync** with that
 * array — the two are checked at compile time by the test suite.
 */
export type RegionName = 'fetched-jd' | 'tool-output' | 'cover-letter';

/**
 * A parsed region: a tool-managed block of content bounded by paired
 * `jho:start:<name>` / `jho:end:<name>` markers (see
 * `core/markers.ts`).
 */
export interface Region {
  /** Region name (e.g., `'fetched-jd'`). */
  name: string;
  /** 1-based line number of the start marker. */
  startLine: number;
  /** 1-based line number of the end marker. */
  endLine: number;
  /** The lines strictly between the two markers (no trailing newline). */
  content: string;
}

/**
 * Options for `replaceRegion` in `core/markers.ts`.
 */
export interface ReplaceRegionOptions {
  /**
   * If `true` and the region does not exist, append a new region to the
   * end of the file. If `false` (default), throw a `MarkerError`.
   */
  createIfMissing?: boolean;
}

/**
 * One row in the ownership table: a file or file region plus the rules
 * that govern how the tool and the user interact with it. See
 * `OWNERSHIP_ROWS` in `core/ownership.ts` for the canonical list.
 */
export interface OwnershipRow {
  /** File or file region (e.g. `'jd.md (above jho:start:fetched-jd)'`). */
  readonly file: string;
  /** Whether and when the tool writes this region. */
  readonly toolWrites: string;
  /** Whether the user is free to edit it (and any caveats). */
  readonly editFreely: string;
  /** What happens to user edits when the tool next writes. */
  readonly onYourEdit: string;
}

/**
 * Options for `renderOwnership` in `core/ownership.ts`.
 */
export interface RenderOwnershipOptions {
  /** When `true`, emit a markdown table instead of the console table. */
  readonly markdown?: boolean;
  /**
   * Override the path shown in the header (default: the resolved global
   * `config.json`). Useful for tests.
   */
  readonly configPath?: string;
}

/** GitHub user profile returned by `GET /users/{username}`. */
export type GithubUser =
  paths['/users/{username}']['get']['responses'][200]['content']['application/json'];

/** GitHub repository returned by `GET /users/{username}/repos`. */
export type GithubRepo =
  paths['/users/{username}/repos']['get']['responses'][200]['content']['application/json'][number];

/**
 * Actions available in the target roles review loop during `jho init`.
 */
export type RoleAction = 'accept' | 'edit' | 'add' | 'delete';
