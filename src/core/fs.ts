import { copyFile, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { AtomicWriteOptions, WithBackupOptions } from './types.js';

function generateTempName(target: string): string {
  const suffix = randomBytes(6).toString('hex');
  return `${target}.${process.pid}.${Date.now()}.${suffix}.tmp`;
}

async function ensureParentDir(target: string, ensureDir: boolean): Promise<void> {
  if (!ensureDir) {
    return;
  }
  await mkdir(dirname(target), { recursive: true });
}

export async function atomicWrite(
  target: string,
  content: string | Uint8Array,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const { encoding = 'utf8', mode, ensureDir = true } = options;
  const resolved = isAbsolute(target) ? target : resolve(target);
  await ensureParentDir(resolved, ensureDir);

  const tmp = generateTempName(resolved);
  await writeFile(tmp, content, { encoding, mode });
  await rename(tmp, resolved);
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return false;
    }
    throw err;
  }
}

export async function withBackup<T>(
  target: string,
  fn: () => Promise<T>,
  options: WithBackupOptions = {},
): Promise<T> {
  const { backupSuffix = '.bak' } = options;
  const exists = await pathExists(target);
  const backup = `${target}${backupSuffix}`;
  if (exists) {
    await copyFile(target, backup);
  }
  try {
    return await fn();
  } catch (err) {
    if (exists) {
      await rm(target, { force: true });
      await rename(backup, target);
    }
    throw err;
  } finally {
    if (exists) {
      await rm(backup, { force: true });
    }
  }
}
