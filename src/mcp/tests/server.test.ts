import { describe, it, expect, vi } from 'vitest';
import { createServer, startServer } from '../server.js';

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('createServer', () => {
  it('returns an McpServer instance', async () => {
    const server = createServer();
    expect(server).toBeDefined();
  }, 30_000);

  it('has server info with name and version', async () => {
    const server = createServer();
    const info = (
      server as unknown as { server: { _serverInfo: { name: string; version: string } } }
    ).server._serverInfo;
    expect(info?.name).toBe('jho-mcp');
    expect(typeof info?.version).toBe('string');
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
  }, 30_000);
});

describe('startServer', () => {
  it('connects to stdio transport', async () => {
    await startServer();
  }, 30_000);
});
