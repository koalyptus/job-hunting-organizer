import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runCommand } from '../../src/cli/tests/helpers.js';
import { mcpCommand } from '../../src/cli/commands/mcp.js';
import * as mcpServer from '../../src/mcp/server.js';
import { UNSAFE_HTTP_ENV_VAR } from '../../src/mcp/server.js';
import type { TestEnv } from '../helpers.js';
import { createTestCampaign, setupTestEnv, cleanupTestDir } from '../helpers.js';

describe('CLI: mcp command', () => {
  const originalFlag = process.env[UNSAFE_HTTP_ENV_VAR];
  let env: TestEnv;
  let restore: () => void;
  let startServerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    env = await createTestCampaign();
    restore = setupTestEnv(env.configHome, env.dataRoot);
    startServerSpy = vi.spyOn(mcpServer, 'startServer').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    startServerSpy.mockRestore();
    if (originalFlag === undefined) {
      delete process.env[UNSAFE_HTTP_ENV_VAR];
    } else {
      process.env[UNSAFE_HTTP_ENV_VAR] = originalFlag;
    }
    restore();
    await cleanupTestDir(env.testHome);
  });

  it('starts MCP server with --help flag', async () => {
    const { stdout, exitCode } = await runCommand(mcpCommand, ['mcp', '--help']);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('mcp');
    expect(stdout).toContain('--http');
    expect(stdout).toContain('--port <port>');
  });

  it('starts stdio transport by default', async () => {
    const { exitCode } = await runCommand(mcpCommand, ['mcp']);

    expect(exitCode).toBe(0);
    expect(startServerSpy).toHaveBeenCalledWith({ transport: 'stdio', port: 7331 });
  });

  it('refuses HTTP transport without the opt-in flag', async () => {
    delete process.env[UNSAFE_HTTP_ENV_VAR];
    startServerSpy.mockRestore();

    const { stderr, exitCode } = await runCommand(mcpCommand, ['mcp', '--http']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain(UNSAFE_HTTP_ENV_VAR);
  });

  it('rejects an invalid --port value', async () => {
    startServerSpy.mockRestore();

    const { stderr, exitCode } = await runCommand(mcpCommand, ['mcp', '--port', 'abc']);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('invalid port');
  });

  it('passes HTTP transport options through when opted in', async () => {
    process.env[UNSAFE_HTTP_ENV_VAR] = '1';

    const { exitCode } = await runCommand(mcpCommand, ['mcp', '--http', '--port', '8080']);

    expect(exitCode).toBe(0);
    expect(startServerSpy).toHaveBeenCalledWith({ transport: 'http', port: 8080 });
  });
});
