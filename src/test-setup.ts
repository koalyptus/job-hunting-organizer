import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { afterEach, afterAll } from 'vitest';

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

afterEach(() => {
  // Reset env vars to the global test dir after each test.
  // This catches tests that modify env vars without restoring them.
  process.env['JHO_CONFIG_HOME'] = join(globalTestDir, '.jho');
  process.env['JHO_DATA'] = join(globalTestDir, 'data');
});

afterAll(() => {
  rmSync(globalTestDir, { recursive: true, force: true });
});
