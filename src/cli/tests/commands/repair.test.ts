import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearConfigCache } from '../../../core/config/config.js';
import { runCommand } from '../helpers.js';
import { repairCommand } from '../../commands/repair.js';
import * as repairCore from '../../../core/repair/index.js';
import { RepairError } from '../../../core/repair/index.js';
import type { RepairResult } from '../../../core/repair/types.js';

vi.mock('../../../core/repair/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof repairCore>();
  return {
    ...actual,
    repairAll: vi.fn(),
    repairApp: vi.fn(),
  };
});

vi.mock('../../../core/spinner.js', () => ({
  withSpinner: vi.fn((_msg: string, _success: string, fn: () => Promise<unknown>) => fn()),
}));

describe('repair command', () => {
  let testHome: string;
  let originalJhoConfigHome: string | undefined;
  let originalJhoData: string | undefined;

  beforeEach(async () => {
    originalJhoConfigHome = process.env['JHO_CONFIG_HOME'];
    originalJhoData = process.env['JHO_DATA'];
    testHome = await mkdtemp(join(tmpdir(), 'jho-repair-'));
    process.env['JHO_CONFIG_HOME'] = join(testHome, '.jho');
    process.env['JHO_DATA'] = join(testHome, 'data');
    clearConfigCache();

    // Set up global config
    await mkdir(join(testHome, '.jho'), { recursive: true });
    await writeFile(
      join(testHome, '.jho', 'config.json'),
      JSON.stringify({
        version: 1,
        dataRoot: join(testHome, 'data'),
        llm: { baseUrl: 'http://localhost:11434/v1', apiKey: 'test-key', model: 'test-model' },
        github: { user: 'testuser', token: '', repos: [] },
        calendar: {
          defaultProvider: 'ics',
          outlook: { tenantId: '', clientId: '', clientSecret: '' },
        },
        logging: { level: 'silent', file: '', redactPaths: [] },
      }),
    );

    // Create campaign structure
    const campaignDir = join(testHome, 'data', 'campaigns', 'default');
    await mkdir(join(campaignDir, 'applied'), { recursive: true });
    await writeFile(
      join(campaignDir, 'config.json'),
      JSON.stringify({
        version: 1,
        profile: { path: '' },
        cv: { path: '' },
        linkedin: { url: '' },
        applied: { dir: '' },
        knowledgeBase: { dir: '' },
      }),
    );
  });

  afterEach(async () => {
    clearConfigCache();
    vi.restoreAllMocks();
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
    await rm(testHome, { recursive: true, force: true });
  });

  describe('campaign-wide repair', () => {
    it('shows nothing to repair when no actions', async () => {
      vi.mocked(repairCore.repairAll).mockResolvedValue({
        actions: [],
        isIndexRebuilt: true,
      });

      const { stdout, exitCode } = await runCommand(repairCommand, ['repair']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Nothing to repair');
    });

    it('shows repair actions', async () => {
      const result: RepairResult = {
        actions: [
          { action: 'toolhash_updated', message: 'Updated sidecar for meta.md', slug: 'test-slug' },
          { action: 'index_rebuilt', message: 'Rebuilt index with 3 entries', slug: null },
        ],
        isIndexRebuilt: true,
      };
      vi.mocked(repairCore.repairAll).mockResolvedValue(result);

      const { stdout, exitCode } = await runCommand(repairCommand, ['repair']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Updated sidecar for meta.md');
      expect(stdout).toContain('Rebuilt index with 3 entries');
      expect(stdout).toContain('Performed 2 repair action(s)');
    });

    it('exits with error when RepairError is thrown', async () => {
      vi.mocked(repairCore.repairAll).mockRejectedValue(new RepairError('Repair failed'));

      const { stderr, exitCode } = await runCommand(repairCommand, ['repair']);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Repair failed');
    });
  });

  describe('single app repair', () => {
    it('repairs single app', async () => {
      const result: RepairResult = {
        actions: [
          { action: 'toolhash_updated', message: 'Updated sidecar for meta.md', slug: 'test-slug' },
        ],
        isIndexRebuilt: false,
      };
      vi.mocked(repairCore.repairApp).mockResolvedValue(result);

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stdout, exitCode } = await runCommand(repairCommand, ['repair', slug]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Updated sidecar for meta.md');
      expect(stdout).toContain('Performed 1 repair action(s)');
    });

    it('shows nothing to repair for empty result', async () => {
      vi.mocked(repairCore.repairApp).mockResolvedValue({
        actions: [],
        isIndexRebuilt: false,
      });

      const slug = '2026-Jun-29-SE-Test-Corp';
      const campaignDir = join(testHome, 'data', 'campaigns', 'default');
      await mkdir(join(campaignDir, 'applied', slug), { recursive: true });

      const { stdout, exitCode } = await runCommand(repairCommand, ['repair', slug]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Nothing to repair');
    });
  });

  describe('help text', () => {
    it('contains examples', async () => {
      const helpOutput = repairCommand.helpInformation();
      expect(helpOutput).not.toContain('--all');
      expect(helpOutput).toContain('repair');
    });
  });
});
