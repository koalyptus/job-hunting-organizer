import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache } from '../../../core/config/config.js';
import { runCommand } from '../helpers.js';
import { removeApplicationCommand } from '../../commands/remove-application.js';
import type { FileStore } from '../../../storage/types.js';

const SLUG = '2026-Jan-15-frontend-acme-12345';

vi.mock('../../../storage/index.js', () => ({
  createStore: vi.fn(),
}));

import { createStore } from '../../../storage/index.js';

const mockedCreateStore = vi.mocked(createStore);

/** Port contract test — stubbed store, verifies preflight routes through FileStore */
describe('remove-application routes preflight through the FileStore port', () => {
  let testHome: string;
  let existsCalls: string[];
  let originalJhoConfigHome: string | undefined;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-rm-app-port-'));
    process.env['JHO_CONFIG_HOME'] = join(testHome, '.jho');
    process.env['JHO_DATA'] = join(testHome, 'data');
    clearConfigCache();

    await mkdir(join(testHome, '.jho'), { recursive: true });
    await writeFile(
      join(testHome, '.jho', 'config.json'),
      JSON.stringify({
        version: 1,
        dataRoot: join(testHome, 'data'),
        llm: { baseUrl: '', apiKey: '***', model: '' },
        github: { user: '', token: '', repos: [] },
        logging: { level: 'info', file: '', redactPaths: [] },
      }),
    );

    existsCalls = [];
    const store: FileStore = {
      getDataRoot: () => join(testHome, 'data'),
      exists: async (p: string) => {
        existsCalls.push(p);
        return true;
      },
      read: async () => '',
      readBytes: async () => new Uint8Array(),
      write: async () => {},
      append: async () => {},
      stat: async () => ({ kind: 'file' as const, size: 0, mtime: new Date() }),
      readdir: async () => [],
      mkdir: async () => {},
      rename: async () => {},
      rm: async () => {},
      copy: async () => {},
      withLock: async <T>(_key: string, fn: () => Promise<T>) => fn(),
    };
    mockedCreateStore.mockReturnValue(store);
  });

  afterEach(async () => {
    clearConfigCache();
    mockedCreateStore.mockReset();
    if (originalJhoConfigHome === undefined) {
      delete process.env['JHO_CONFIG_HOME'];
    } else {
      process.env['JHO_CONFIG_HOME'] = originalJhoConfigHome;
    }
    if (originalJhoData === undefined) {
      delete process.env['JHO_DATA'];
    } else {
      process.env['JHO_DATA'] = originalJhoData;
    }
    if (testHome) {
      await rm(testHome, { recursive: true, force: true });
    }
  });

  it('queries the port with a root-relative StoragePath, not an absolute path', async () => {
    await runCommand(removeApplicationCommand, ['remove-application', SLUG, '--yes']);
    expect(existsCalls.length).toBeGreaterThan(0);
    const calledPath = existsCalls[0]!;
    expect(calledPath).toContain(SLUG);
    expect(calledPath.startsWith(testHome)).toBe(false);
    expect(calledPath).not.toContain(join(testHome, 'data'));
  });

  it('passes the application folder as a root-relative path to the store', async () => {
    await runCommand(removeApplicationCommand, ['remove-application', SLUG, '--yes']);
    expect(existsCalls.length).toBeGreaterThan(0);
    expect(existsCalls[0]).toBe(join('campaigns', 'default', 'applied', SLUG));
  });

  it('throws ApplicationNotFoundError when the port reports absence', async () => {
    mockedCreateStore.mockReturnValue({
      getDataRoot: () => join(testHome, 'data'),
      exists: async () => false,
      read: async () => '',
      readBytes: async () => new Uint8Array(),
      write: async () => {},
      append: async () => {},
      stat: async () => ({ kind: 'file' as const, size: 0, mtime: new Date() }),
      readdir: async () => [],
      mkdir: async () => {},
      rename: async () => {},
      rm: async () => {},
      copy: async () => {},
      withLock: async <T>(_key: string, fn: () => Promise<T>) => fn(),
    } as FileStore);

    const { stderr, exitCode } = await runCommand(removeApplicationCommand, [
      'remove-application',
      SLUG,
      '--yes',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not found');
  });

  it('constructs the StoragePath directly from the known layout; no filesystem-relative math can produce an escaping path', async () => {
    const appliedDir = join(testHome, 'data', 'campaigns', 'default', 'applied');
    await mkdir(join(appliedDir, SLUG), { recursive: true });

    mockedCreateStore.mockReturnValue({
      getDataRoot: () => join(testHome, 'other-root'),
      exists: async () => true,
      read: async () => '',
      readBytes: async () => new Uint8Array(),
      write: async () => {},
      append: async () => {},
      stat: async () => ({ kind: 'file' as const, size: 0, mtime: new Date() }),
      readdir: async () => [],
      mkdir: async () => {},
      rename: async () => {},
      rm: async () => {},
      copy: async () => {},
      withLock: async <T>(_key: string, fn: () => Promise<T>) => fn(),
    } as FileStore);

    const { exitCode } = await runCommand(removeApplicationCommand, [
      'remove-application',
      SLUG,
      '--yes',
    ]);
    expect(exitCode).toBe(0);
  });

  it('constructs the StoragePath directly from the known layout; cross-drive absolute paths are impossible', async () => {
    const appliedDir = join(testHome, 'data', 'campaigns', 'default', 'applied');
    await mkdir(join(appliedDir, SLUG), { recursive: true });

    mockedCreateStore.mockReturnValue({
      getDataRoot: () => 'C:\\\\other-root',
      exists: async () => true,
      read: async () => '',
      readBytes: async () => new Uint8Array(),
      write: async () => {},
      append: async () => {},
      stat: async () => ({ kind: 'file' as const, size: 0, mtime: new Date() }),
      readdir: async () => [],
      mkdir: async () => {},
      rename: async () => {},
      rm: async () => {},
      copy: async () => {},
      withLock: async <T>(_key: string, fn: () => Promise<T>) => fn(),
    } as FileStore);

    const { exitCode } = await runCommand(removeApplicationCommand, [
      'remove-application',
      SLUG,
      '--yes',
    ]);
    expect(exitCode).toBe(0);
  });
});
