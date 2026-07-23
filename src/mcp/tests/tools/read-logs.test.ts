import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fakeServer, getTextContent } from './helpers.js';
import { z } from 'zod';

vi.mock('../../../core/logger/logger.js', () => ({
  moduleLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  getRootLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../error-handler.js', () => ({
  handleToolError: vi.fn((err: unknown) => ({
    content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
    isError: true as const,
  })),
}));

vi.mock('../../schemas.js', () => ({
  ReadLogsInput: z.object({
    tail: z.number().int().positive().optional(),
    level: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).optional(),
    json: z.boolean().optional(),
  }),
}));

vi.mock('../../logger.js', () => ({
  mcpLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../core/paths.js', () => ({
  resolveConfigHome: vi.fn(() => '/home/user/.job-hunting-organizer'),
  resolveCampaignRoot: vi.fn(),
  resolveAppliedDir: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, readFileSync } from 'node:fs';
import { registerReadLogs } from '../../tools/read-logs.js';

describe('read_logs tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns log file content', async () => {
    const testLogContent =
      '\n{"level": 30, "time": "2026-07-17T14:05:03Z", "msg": "test log"}\n{"level": 40, "time": "2026-07-17T14:05:04Z", "msg": "warning log"}\n';
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(testLogContent);

    const { server, getCallback } = fakeServer();
    registerReadLogs(server);
    const cb = getCallback()!;

    const result = await cb({}, { signal: AbortSignal.timeout(3000) });
    const data = getTextContent(result);
    expect(data).toContain('test log');
    expect(data).toContain('warning log');
  });

  it('returns error when log file does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const { server, getCallback } = fakeServer();
    registerReadLogs(server);
    const cb = getCallback()!;

    const result = await cb({}, { signal: AbortSignal.timeout(3000) });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('No log file');
  });

  it('filters logs by level', async () => {
    const testLogContent =
      '\n{"level": 60, "msg": "fatal error"}\n{"level": 50, "msg": "error"}\n{"level": 40, "msg": "warning"}\n{"level": 30, "msg": "info"}\n';
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(testLogContent);

    const { server, getCallback } = fakeServer();
    registerReadLogs(server);
    const cb = getCallback()!;

    const result = await cb({ level: 'error' }, { signal: AbortSignal.timeout(3000) });
    const data = getTextContent(result);
    expect(data).toContain('error');
    expect(data).not.toContain('info');
  });

  it('filters logs by tail', async () => {
    const testLogContent =
      '\n{"level": 30, "msg": "log1"}\n{"level": 30, "msg": "log2"}\n{"level": 30, "msg": "log3"}\n{"level": 30, "msg": "log4"}\n';
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(testLogContent);

    const { server, getCallback } = fakeServer();
    registerReadLogs(server);
    const cb = getCallback()!;

    const result = await cb({ tail: 2 }, { signal: AbortSignal.timeout(3000) });
    const data = getTextContent(result);
    expect(data).toContain('log3');
    expect(data).toContain('log4');
    expect(data).not.toContain('log1');
  });

  it('skips unparseable JSON lines during level filtering', async () => {
    const testLogContent = '\nnot valid json\n{"level": 30, "msg": "valid"}\n{broken}\n';
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(testLogContent);

    const { server, getCallback } = fakeServer();
    registerReadLogs(server);
    const cb = getCallback()!;

    const result = await cb({ level: 'info' }, { signal: AbortSignal.timeout(3000) });
    const data = getTextContent(result);
    expect(data).toContain('valid');
    expect(data).not.toContain('not valid json');
    expect(data).not.toContain('broken');
  });

  it('returns empty content when no lines match the level filter', async () => {
    const testLogContent =
      '\n{"level": 10, "msg": "trace detail"}\n{"level": 20, "msg": "debug detail"}\n';
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(testLogContent);

    const { server, getCallback } = fakeServer();
    registerReadLogs(server);
    const cb = getCallback()!;

    const result = await cb({ level: 'warn' }, { signal: AbortSignal.timeout(3000) });
    const data = getTextContent(result);
    expect(data).toBe('');
    expect(result.isError).toBeUndefined();
  });

  it('returns raw lines when json flag is true', async () => {
    const testLogContent = '\n{"level": 30, "msg": "hello"}\n{"level": 40, "msg": "world"}\n';
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(testLogContent);

    const { server, getCallback } = fakeServer();
    registerReadLogs(server);
    const cb = getCallback()!;

    const result = await cb({ json: true }, { signal: AbortSignal.timeout(3000) });
    const data = getTextContent(result);
    expect(data).toContain('"msg": "hello"');
    expect(data).toContain('"msg": "world"');
  });

  it('returns error when readFileSync throws', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('EACCES: permission denied');
    });

    const { server, getCallback } = fakeServer();
    registerReadLogs(server);
    const cb = getCallback()!;

    const result = await cb({}, { signal: AbortSignal.timeout(3000) });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toContain('EACCES: permission denied');
  });
});
