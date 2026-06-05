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
