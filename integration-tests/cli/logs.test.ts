import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { logsCommand } from '../../src/cli/commands/logs.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

describe('CLI: logs command', () => {
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

  it('shows logs path', async () => {
    const { stdout, exitCode } = await runCommand(logsCommand, ['logs', '--path']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('jho.log');
  });

  it('reads logs', async () => {
    await mkdir(env.configHome, { recursive: true });
    await writeFile(
      join(env.configHome, 'jho.log'),
      '{"level":30,"time":1000,"msg":"test entry"}\n',
    );

    const { stdout, exitCode } = await runCommand(logsCommand, ['logs']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('test entry');
  });
});
