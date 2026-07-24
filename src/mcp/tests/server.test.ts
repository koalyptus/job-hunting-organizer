import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EventEmitter } from 'node:events';
import { createServer, startServer, safeLogFatal } from '../server.js';

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    onmessage: null,
    onerror: null,
    onclose: null,
  })),
}));

const mockAppendFileSync = vi.fn();
vi.mock('node:fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    appendFileSync: (...args: unknown[]) => mockAppendFileSync(...args),
  };
});

vi.mock('../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  getMcpLogPath: () => '/tmp/test-mcp.log',
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

describe('safeLogFatal', () => {
  beforeEach(() => {
    mockAppendFileSync.mockReset();
  });

  it('writes a JSON log entry to the file', () => {
    safeLogFatal('test message');
    expect(mockAppendFileSync).toHaveBeenCalledOnce();
    const entry = JSON.parse(mockAppendFileSync.mock.calls[0]![1] as string);
    expect(entry.level).toBe(60);
    expect(entry.msg).toBe('test message');
    expect(entry.pid).toBe(process.pid);
    expect(entry.time).toBeDefined();
  });

  it('includes error details when err is an Error', () => {
    const err = new Error('boom');
    safeLogFatal('crashed', err);
    const entry = JSON.parse(mockAppendFileSync.mock.calls[0]![1] as string);
    expect(entry.err.message).toBe('boom');
    expect(entry.err.stack).toBeDefined();
  });

  it('handles non-Error objects gracefully', () => {
    safeLogFatal('crashed', 'string error');
    const entry = JSON.parse(mockAppendFileSync.mock.calls[0]![1] as string);
    expect(entry.err).toBeUndefined();
  });

  it('does not throw when appendFileSync fails', () => {
    mockAppendFileSync.mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(() => safeLogFatal('test')).not.toThrow();
  });
});

describe('startServer', () => {
  beforeEach(() => {
    mockAppendFileSync.mockReset();
  });

  it('connects to stdio transport', async () => {
    await startServer();
  }, 30_000);

  it('registers uncaughtException handler that logs fatal errors', async () => {
    await startServer();
    const testErr = new Error('test uncaught');
    process.emit('uncaughtException', testErr);
    expect(mockAppendFileSync).toHaveBeenCalled();
    const entry = JSON.parse(mockAppendFileSync.mock.calls[0]![1] as string);
    expect(entry.msg).toBe('uncaughtException');
    expect(entry.err.message).toBe('test uncaught');
  }, 30_000);

  it('registers unhandledRejection handler that logs fatal errors', async () => {
    await startServer();
    const testErr = new Error('test rejection');
    (process as unknown as EventEmitter).emit('unhandledRejection', testErr);
    expect(mockAppendFileSync).toHaveBeenCalled();
    const entry = JSON.parse(mockAppendFileSync.mock.calls[0]![1] as string);
    expect(entry.msg).toBe('unhandledRejection');
  }, 30_000);
});
