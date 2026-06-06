export interface AtomicWriteOptions {
  readonly encoding?: BufferEncoding;
  readonly mode?: number;
  readonly ensureDir?: boolean;
}

export interface WithBackupOptions {
  readonly backupSuffix?: string;
  readonly encoding?: BufferEncoding;
}

export interface AcquireLockOptions {
  readonly retries?: number;
  readonly minTimeout?: number;
  readonly maxTimeout?: number;
  readonly stale?: number;
}

export interface PackageJson {
  readonly name?: string;
  readonly version?: string;
  readonly description?: string;
}

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface LoggerConfig {
  readonly level: LogLevel;
  readonly isTty: boolean;
  readonly file?: string | undefined;
  readonly redactPaths: readonly string[];
  readonly correlationId?: string | undefined;
}

export interface GlobalConfig {
  version: number;
  root: string;
  llm: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  profile: {
    path: string;
  };
  cv: {
    path: string;
  };
  github: {
    user: string;
    token: string;
    repos: string[];
  };
  applied: {
    dir: string;
  };
  knowledgeBase: {
    dir: string;
  };
  calendar: {
    defaultProvider: string;
    outlook: {
      tenantId: string;
      clientId: string;
      clientSecret: string;
    };
  };
  logging: {
    level: LogLevel;
    file: string;
    redactPaths: string[];
  };
}

export interface CampaignConfig {
  version: number;
  profile: {
    path: string;
  };
  applied: {
    dir: string;
  };
  knowledgeBase: {
    dir: string;
  };
}

// Slug inputs (used by `core/slug.ts`).
// See PLAN §4 "Slug convention" for the full pattern.
export interface SlugBuildInput {
  /** Job title (e.g., "Senior Software Engineer"). First 2-3 words become roleAbbr. */
  title?: string | undefined;
  /** Company name (e.g., "Nuage Technology Group"). Lowercased + sanitized. */
  company?: string | undefined;
  /** Job URL. Used to extract a site-specific job ID (Seek, LinkedIn, Indeed). */
  url?: string | undefined;
  /** Application date. ISO string or Date. Defaults to today (UTC). */
  appliedOn?: string | Date | undefined;
}

export interface SlugOptions {
  /** Reserved for future use (e.g., locale-specific date formatting). */
  readonly locale?: string;
}
