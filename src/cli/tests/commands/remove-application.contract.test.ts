import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache } from '../../../lib/config/config.js';
import { runCommand } from '../helpers.js';
import { removeApplicationCommand } from '../../commands/remove-application.js';
import { MemoryFileStore } from '../../../storage/memory.js';

const SLUG = '2026-Jan-15-frontend-acme-12345';

// Inject the real in-memory store (no hand-rolled FileStore mock). A per-test
// override is reached via the hoisted ref so individual cases can seed or
// specialize the store. The command's deletion path still uses real disk
// (ported in a later phase), so success cases also seed the real folder.
const { storeRef, makeStore } = vi.hoisted(() => {
  const storeRef: { current: MemoryFileStore } = {
    current: undefined as unknown as MemoryFileStore,
  };
  return { storeRef, makeStore: () => storeRef.current };
});

vi.mock('../../../storage/index.js', () => ({
  createStore: () => makeStore(),
}));

/** Port contract test — real in-memory store verifies preflight routes through FileStore */
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

    // Wrap a fresh in-memory store so we can record the paths handed to
    // `exists` (the command probes presence before removing).
    existsCalls = [];
    const store = new MemoryFileStore();
    const origExists = store.exists.bind(store);
    store.exists = async (p: string) => {
      existsCalls.push(p);
      return origExists(p);
    };
    storeRef.current = store;
  });

  afterEach(async () => {
    clearConfigCache();
    storeRef.current = undefined as unknown as MemoryFileStore;
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
    storeRef.current.exists = async () => false;

    const { stderr, exitCode } = await runCommand(removeApplicationCommand, [
      'remove-application',
      SLUG,
      '--yes',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not found');
  });

  it('constructs the StoragePath directly from the known layout; no filesystem-relative math can produce an escaping path', async () => {
    // Seed the in-memory store (port preflight) AND the real disk folder
    // (deletion path, not yet ported): both must agree for a clean delete.
    await storeRef.current.mkdir(join('campaigns', 'default', 'applied', SLUG));
    await mkdir(join(testHome, 'data', 'campaigns', 'default', 'applied', SLUG), {
      recursive: true,
    });

    const { exitCode } = await runCommand(removeApplicationCommand, [
      'remove-application',
      SLUG,
      '--yes',
    ]);
    expect(exitCode).toBe(0);
  });

  it('constructs the StoragePath directly from the known layout; cross-drive absolute paths are impossible', async () => {
    // Seed the in-memory store and a Windows-style data root, proving the
    // command does not prepend the store root to build paths.
    await storeRef.current.mkdir(join('campaigns', 'default', 'applied', SLUG));
    await mkdir(join(testHome, 'data', 'campaigns', 'default', 'applied', SLUG), {
      recursive: true,
    });
    storeRef.current.getDataRoot = () => 'C:\\other-root';

    const { exitCode } = await runCommand(removeApplicationCommand, [
      'remove-application',
      SLUG,
      '--yes',
    ]);
    expect(exitCode).toBe(0);
  });
});
