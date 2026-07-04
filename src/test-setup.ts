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
  // On Windows Node 20, pino file destinations may hold file handles
  // briefly after close, causing rmSync to fail with ENOTEMPTY.
  // Retry with exponential backoff on those errors.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      rmSync(globalTestDir, { recursive: true, force: true });
      return;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt === 4 || (code !== 'ENOTEMPTY' && code !== 'EPERM')) {
        throw err;
      }
      // Synchronous wait via Atomics (setup file must stay sync)
      const buf = new SharedArrayBuffer(4);
      const view = new Int32Array(buf);
      Atomics.wait(view, 0, 0, 50 * 2 ** attempt);
    }
  }
});
