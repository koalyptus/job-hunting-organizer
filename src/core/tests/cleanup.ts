import { rm } from 'node:fs/promises';
import type { Logger } from 'pino';
import { closeLogger } from '../logger/logger.js';

/**
 * Remove a temp directory, closing any pino loggers first.
 * On Windows Node 20, pino file destinations may hold file handles
 * briefly after `closeLogger` / `stream.destroy()`, causing `rm`
 * to fail with ENOTEMPTY or EPERM. This function retries with
 * exponential backoff on those errors.
 */
export async function cleanupTempDir(dir: string, loggers: Logger[] = []): Promise<void> {
  for (const log of loggers) {
    closeLogger(log);
  }
  if (process.platform === 'win32') {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await rm(dir, { recursive: true, force: true });
        return;
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (attempt === 4 || (code !== 'ENOTEMPTY' && code !== 'EPERM')) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, 50 * 2 ** attempt));
      }
    }
  } else {
    await rm(dir, { recursive: true, force: true });
  }
}
