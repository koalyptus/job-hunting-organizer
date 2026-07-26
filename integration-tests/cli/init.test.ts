import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { initCommand } from '../../src/cli/commands/init.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

vi.mock('../../src/core/logger/logger.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getRootLogger: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      flush: vi.fn(),
      child: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        flush: vi.fn(),
      })),
    })),
    moduleLogger: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    })),
    childLogger: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  };
});

vi.mock('../../src/core/locks.js', () => ({
  acquireLock: vi.fn(async (_target: string, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../../src/core/campaign/profile-builder.js', async () => {
  const { resolveProfilePath } = await import('../../src/core/paths.js');
  const { atomicWrite } = await import('../../src/core/fs.js');
  return {
    handleProfile: vi.fn(async (opts: { campaignRoot: string }) => {
      const skeleton = `# Profile\n\nGenerated skeleton.\n`;
      const profilePath = resolveProfilePath(opts.campaignRoot);
      await atomicWrite(profilePath, skeleton);
      return skeleton;
    }),
  };
});

describe('CLI: init command', () => {
  let env: TestEnv;
  let restore: () => void;

  beforeEach(async () => {
    env = await createTestCampaign();
    restore = setupTestEnv(env.configHome, env.dataRoot);
  });

  afterEach(async () => {
    restore();
    await cleanupTestDir(env.testHome);
  });

  it('init with --yes creates campaign structure', async () => {
    const { exitCode } = await runCommand(initCommand, ['init', 'test-init', '--yes']);

    expect(exitCode).toBe(0);
  });
});
