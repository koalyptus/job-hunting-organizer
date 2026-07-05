import type { paths } from '@octokit/openapi-types';
import type { Logger } from 'pino';
import type { ApplicationStatus } from './applications/types.js';

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
const LOG_LEVEL_VALUES = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export type LogLevel = (typeof LOG_LEVEL_VALUES)[number];

/**
 * All log levels including `silent` (for config schema).
 */
export const ALL_LOG_LEVELS: readonly LogLevel[] = LOG_LEVEL_VALUES;

/**
 * Log levels that can be used as filter thresholds (excludes `silent`
 * which disables logging entirely).
 */
export const FILTERABLE_LOG_LEVELS: readonly LogLevel[] = LOG_LEVEL_VALUES.slice(0, -1);

/** Default log filename placed inside the config home directory. */
export const DEFAULT_LOG_FILENAME = 'jho.log';

/**
 * Runtime configuration for the logger factory in `core/logger.ts`.
 */
export interface LoggerConfig {
  /** Minimum level to emit. */
  readonly level: LogLevel;
  /** Optional file path to write JSON logs to. When undefined, no file is written. */
  readonly file?: string | undefined;
  /** JSON paths whose values are replaced with `[REDACTED]` in log output. */
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
  /** Per-request timeout in milliseconds for LLM calls (default 1200s). */
  readonly timeoutMs: number;
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
  /** Request timeout in milliseconds. Default: `1_200_000`. */
  readonly timeout?: number;
  /** Max retries on transient errors (429, 5xx, network). Default: `0`. */
  readonly maxRetries?: number;
  /** Custom fetch implementation. Default: a `node:http`/`node:https`-based
   *  function that bypasses undici's 300-second internal timeout cap. */
  readonly fetch?: typeof globalThis.fetch;
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
    /** Per-request timeout in milliseconds for LLM calls (default 20min). */
    timeoutMs: number;
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
    /** Default log file path. Absent or empty uses the default path (`<configHome>/jho.log`). */
    file?: string;
    /** When true, suppress all file logging regardless of `file`. */
    disableFileLogging?: boolean;
    /** JSON paths to redact in addition to the built-in secret list. */
    redactPaths: string[];
  };
  /** When false, disable ANSI colour output. Respects `NO_COLOR` env var and `--no-color` CLI flag. */
  color?: boolean;
  /** HTTP fetch settings. */
  fetch: {
    /** Timeout in milliseconds for each HTTP request (default 30s). */
    timeoutMs: number;
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
export type RegionName = 'fetched-jd' | 'tool-output' | 'cover-letter' | 'prepare';

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
  /**
   * Optional color functions for console table styling. Each is a simple
   * `(text: string) => string` wrapper (e.g. `chalk.bold`, `chalk.cyan`).
   * When provided, the column headers are wrapped with `colorize.bold` and
   * the file column with `colorize.cyan`. Ignored in markdown mode.
   */
  readonly colorize?: Colorize;
}

/**
 * A campaign as returned by {@link listCampaigns}. Name is the folder
 * basename under `<dataRoot>/campaigns/`; the application count is the
 * number of entries in `.index.json` (0 if missing or unreadable).
 */
export interface CampaignListing {
  /** Campaign folder name (e.g. `'default'`, `'freelance'`). */
  readonly name: string;
  /** Number of tracked applications in the campaign. */
  readonly applicationCount: number;
}

/**
 * Stats for a single campaign, derived from `.index.json` and `meta.md`
 * bodies. Returned by {@link computeStats} in `core/stats.ts`.
 */
export interface CampaignStats {
  /** Total applications counted (after filters). */
  readonly total: number;
  /** Counts grouped by lifecycle status. All 8 statuses are present (zero if none). */
  readonly byStatus: Record<ApplicationStatus, number>;
  /** Counts grouped by target role slug. Key `''` represents unassigned apps. */
  readonly byRole: Record<string, number>;
  /** Counts grouped by site. Key `''` represents apps with no site. */
  readonly bySite: Record<string, number>;
  /** Funnel snapshot: applied → interview → offer → accepted. */
  readonly funnel: {
    readonly applied: number;
    readonly interview: number;
    readonly offer: number;
    readonly accepted: number;
  };
  /** Delta for the current calendar month (UTC). */
  readonly thisMonth: {
    readonly applied: number;
    readonly rejected: number;
    readonly offer: number;
    readonly withdrawn: number;
  };
  /** Earliest `appliedOn` date in the result set (ISO). Undefined when total is 0. */
  readonly since?: string;
}

/**
 * Options for {@link computeStats} in `core/stats.ts`.
 */
export interface StatsOptions {
  /** Filter by target role slug. */
  readonly targetRole?: string;
  /** Filter by date: ISO date string or relative duration (`7d`, `30d`, `90d`). */
  readonly since?: string;
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

/**
 * Optional color functions for console output. Each is a
 * `(text: string) => string` wrapper (e.g. `chalk.bold`).
 * When provided, the output is colorized. When omitted, plain
 * text is returned.
 */
export interface Colorize {
  /** Bold styling (used for headers and labels). */
  readonly bold: (text: string) => string;
  /** Dim styling (used for percentages and funnel arrows). */
  readonly dim: (text: string) => string;
  /** Cyan styling (used for role names and campaign names). */
  readonly cyan: (text: string) => string;
  /** Green styling (used for positive deltas and accepted). */
  readonly green: (text: string) => string;
  /** Yellow styling (used for interview status). */
  readonly yellow: (text: string) => string;
  /** Red styling (used for negative deltas and rejected). */
  readonly red: (text: string) => string;
  /** Status-specific colour (applied, interview, offer, etc.). */
  readonly statusColor: (text: string) => string;
}

const identity = <T>(t: T) => t;
const noStyle: Colorize = {
  bold: identity,
  dim: identity,
  cyan: identity,
  green: identity,
  yellow: identity,
  red: identity,
  statusColor: identity,
};

/**
 * Options for {@link generateCoverLetter} in `core/cover-letter.ts`.
 */
export interface CoverLetterOptions {
  /** Application slug (resolved by CLI via cwd inference or explicit arg). */
  readonly slug: string;
  /** Campaign name. */
  readonly campaign: string;
  /** Skip overwrite confirmation prompt. */
  readonly skipConfirmation?: boolean;
  /** If true, print to stdout only (skip file write). */
  readonly noSave?: boolean;
  /**
   * Custom instructions for the LLM. When provided, overwrites any
   * existing steer in `cover-letter.md`. When omitted, the existing
   * steer (if any) is preserved.
   */
  readonly steer?: string;
  /** Optional pino logger. */
  readonly log?: Logger;
}

/**
 * Result of a successful {@link generateCoverLetter} call.
 */
export interface CoverLetterResult {
  /** The generated cover letter markdown content. */
  readonly content: string;
  /** Approximate word count. */
  readonly wordCount: number;
  /** The model identifier that produced the response. */
  readonly model: string;
  /** Wall-clock duration of the LLM request in milliseconds. */
  readonly durationMs: number;
}

/**
 * Options for {@link answerQuestion} in `core/application-qa.ts`.
 */
export interface AnswerOptions {
  /** Application slug (resolved by CLI via cwd inference or explicit arg). */
  readonly slug: string;
  /** Campaign name. */
  readonly campaign: string;
  /** The question to answer. */
  readonly question: string;
  /** Optional image file path (screenshot of the question). */
  readonly imagePath?: string;
  /**
   * Custom instructions for the LLM. Stored with the Q&A entry
   * in `qa.md` for reference. Each answer has its own steer.
   */
  readonly steer?: string;
  /** If true, print to stdout only (skip file write). */
  readonly noSave?: boolean;
  /** Optional pino logger. */
  readonly log?: Logger;
}

/**
 * Result of a successful {@link answerQuestion} call.
 */
export interface AnswerResult {
  /** The generated answer text. */
  readonly answer: string;
  /** Approximate word count. */
  readonly wordCount: number;
  /** The model identifier that produced the response. */
  readonly model: string;
  /** Wall-clock duration of the LLM request in milliseconds. */
  readonly durationMs: number;
}

/**
 * Return the given {@link Colorize} or a no-op fallback that
 * returns plain text.  Callers can use `style.fn(text)` instead of
 * `colorize ? colorize.fn(text) : text`.
 */
export function resolveStyle(colorize?: Colorize): Colorize {
  return colorize ?? noStyle;
}
