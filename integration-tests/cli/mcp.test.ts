import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { mcpCommand } from '../../src/cli/commands/mcp.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

describe('CLI: mcp command', () => {
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

  it('starts MCP server with --help flag', async () => {
    const { stdout, exitCode } = await runCommand(mcpCommand, ['mcp', '--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('mcp');
  });
});
