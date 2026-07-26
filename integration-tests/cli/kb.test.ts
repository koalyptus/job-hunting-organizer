import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { kbCommand } from '../../src/cli/commands/kb.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

describe('CLI: kb command', () => {
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

  it('adds a file to knowledge base', async () => {
    const filePath = join(env.testHome, 'sample.md');
    await writeFile(filePath, '# Sample Doc\n\nThis is a sample document.');

    const { stdout, exitCode } = await runCommand(kbCommand, ['kb', 'add', filePath]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Copied');
  });

  it('kb update re-syncs knowledge base', async () => {
    const { exitCode } = await runCommand(kbCommand, ['kb', 'update']);

    expect(exitCode).toBe(0);
  });
});
