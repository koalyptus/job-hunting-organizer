import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { vi, afterEach, afterAll } from 'vitest';
import pino from 'pino';
import type { Logger } from 'pino';

/**
 * Global test setup: ensures JHO_CONFIG_HOME and JHO_DATA always point
 * to isolated temp directories. Prevents any test from accidentally
 * reading or writing to the user's real config/data directories.
 *
 * Individual tests can still override these env vars for their own
 * temp dirs — this is the safety net for tests that forget.
 */
const globalTestDir = mkdtempSync(join(tmpdir(), 'jho-global-test-'));

process.env['JHO_CONFIG_HOME'] = join(globalTestDir, '.jho');
process.env['JHO_DATA'] = join(globalTestDir, 'data');

// Prevent pino from opening file handles inside the temp dir. The silent
// logger is used for getRootLogger() so that moduleLogger() calls across
// the codebase never create real file destinations — keeping the temp dir
// cleanable on Windows Node 20 where file handles are slow to release.
const silentLogger = pino({ level: 'silent' });
vi.mock('./core/logger/logger.js', async (importOriginal) => {
  const mod = await importOriginal<{
    createLogger: (...args: unknown[]) => Logger;
    defaultLoggerConfig: (...args: unknown[]) => unknown;
    childLogger: (...args: unknown[]) => Logger;
    moduleLogger: (...args: unknown[]) => Logger;
    closeLogger: (...args: unknown[]) => void;
    logError: (...args: unknown[]) => void;
    isInteractive: (...args: unknown[]) => boolean;
    getRootLogger: () => Logger;
    setRootLogger: (logger: Logger) => void;
  }>();
  return {
    ...mod,
    getRootLogger: () => silentLogger,
    setRootLogger: () => {},
  };
});

afterEach(() => {
  // Reset env vars to the global test dir after each test.
  // This catches tests that modify env vars without restoring them.
  process.env['JHO_CONFIG_HOME'] = join(globalTestDir, '.jho');
  process.env['JHO_DATA'] = join(globalTestDir, 'data');
});

afterAll(async () => {
  // On Windows Node 20, file handles (proper-lockfile sidecars, config.json
  // writes, etc.) may be slow to release. Retry with exponential backoff.
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      rmSync(globalTestDir, { recursive: true, force: true });
      return;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt === 4 || (code !== 'ENOTEMPTY' && code !== 'EPERM')) {
        throw err;
      }
      await delay(50 * 2 ** attempt);
    }
  }
});
