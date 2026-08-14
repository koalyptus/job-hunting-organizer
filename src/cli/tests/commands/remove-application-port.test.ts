import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache } from '../../../core/config/config.js';
import { runCommand } from '../helpers.js';
import { removeApplicationCommand } from '../../commands/remove-application.js';
import type { FileStore } from '../../../storage/types.js';

const SLUG = '2026-Jan-15-frontend-acme-12345';

/**
 * Regression guard for Phase 9c: the CLI `remove-application` command must
 * route its existence preflight through the injected `FileStore` port, never
 * `node:fs` / `core/fs` directly. We stub `createStore` so the only way the
 * command can decide "exists" is via the port, and assert it is called with a
 * ROOT-RELATIVE (not absolute) `StoragePath`.
 */
vi.mock('../../../storage/index.js', () => {
  return {
    createStore: vi.fn(),
  };
});

import { createStore } from '../../../storage/index.js';

const mockedCreateStore = vi.mocked(createStore);

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
        llm: { baseUrl: '', apiKey: '', model: '' },
        github: { user: '', token: '', repos: [] },
        logging: { level: 'info', file: '', redactPaths: [] },
      }),
    );

    existsCalls = [];
    const store = {
      getDataRoot: () => join(testHome, 'data'),
      exists: async (p: string) => {
        existsCalls.push(p);
        // The folder lives on disk for the delete step, but the preflight
        // decision comes solely from this stubbed port call.
        return true;
      },
    } as unknown as FileStore;
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
    // A StoragePath is relative to the data root and must not carry the
    // absolute data-root prefix (e.g. `/tmp/.../data/...`).
    expect(calledPath.startsWith(testHome)).toBe(false);
    expect(calledPath).not.toContain(join(testHome, 'data'));
  });

  it('passes the application folder as a root-relative path to the store', async () => {
    await runCommand(removeApplicationCommand, ['remove-application', SLUG, '--yes']);
    expect(existsCalls.length).toBeGreaterThan(0);
    // The resolved StoragePath is relative to the data root, i.e. it names
    // the application folder (campaigns/default/applied/<slug>), not the
    // absolute disk path.
    expect(existsCalls[0]).toBe(join('campaigns', 'default', 'applied', SLUG));
  });

  it('throws ApplicationNotFoundError when the port reports absence', async () => {
    mockedCreateStore.mockReturnValue({
      getDataRoot: () => join(testHome, 'data'),
      exists: async () => false,
    } as unknown as FileStore);

    const { stderr, exitCode } = await runCommand(removeApplicationCommand, [
      'remove-application',
      SLUG,
      '--yes',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not found');
  });

  it('fails closed when the resolved path escapes the store root', async () => {
    // Simulate the data-root resolution diverging from the applied dir's
    // root: `relative()` would then emit a `..`-prefixed (escaping) path.
    // The command must refuse to query it and report not-found instead.
    mockedCreateStore.mockReturnValue({
      getDataRoot: () => join(testHome, 'other-root'),
      exists: async () => {
        throw new Error('must not reach the port with an escaping path');
      },
    } as unknown as FileStore);

    const { stderr, exitCode } = await runCommand(removeApplicationCommand, [
      'remove-application',
      SLUG,
      '--yes',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not found');
  });

  it('fails closed when the resolved path is absolute (cross-drive)', async () => {
    // On a different drive `relative()` returns an absolute drive-letter
    // path; the guard must reject it before the port is queried.
    mockedCreateStore.mockReturnValue({
      getDataRoot: () => 'C:\\other-root',
      exists: async () => {
        throw new Error('must not reach the port with an absolute path');
      },
    } as unknown as FileStore);

    const { stderr, exitCode } = await runCommand(removeApplicationCommand, [
      'remove-application',
      SLUG,
      '--yes',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not found');
  });
});
