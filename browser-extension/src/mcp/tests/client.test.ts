import { describe, expect, it, vi } from 'vitest';
import { McpBridgeClient, McpHttpError } from '../client';
import type { FetchLike } from '../client';

/** A recorded call to the stubbed fetch. */
interface RecordedCall {
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/**
 * Build a stub `fetch` that returns queued responses and records every call.
 *
 * @param responses - Responses to return, in order.
 * @returns The stub and the call log.
 */
function stubFetch(responses: Array<{ status: number; contentType: string; body: string; headers?: Record<string, string> }>): {
  fetch: FetchLike;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  let index = 0;

  const fetchImpl: FetchLike = async (_input, init) => {
    calls.push({
      method: init?.method ?? 'GET',
      headers: init?.headers ?? {},
      body: init?.body,
    });

    const response = responses[Math.min(index, responses.length - 1)] ?? responses[0];
    index += 1;
    if (response === undefined) {
      throw new Error('stub fetch ran out of queued responses');
    }

    return {
      status: response.status,
      headers: new Headers(response.headers ?? { 'content-type': response.contentType }),
      text: async () => response.body,
    };
  };

  return { fetch: fetchImpl, calls };
}

/** A `tools/call` result envelope as the server returns it. */
const TOOL_RESULT = JSON.stringify({
  jsonrpc: '2.0',
  id: 2,
  result: { content: [{ type: 'text', text: '{"entries":[]}' }] },
});

describe('McpBridgeClient', () => {
  it('performs the initialize handshake and captures the session id', async () => {
    const { fetch, calls } = stubFetch([
      {
        status: 200,
        contentType: 'application/json',
        headers: { 'Mcp-Session-Id': 'sess-1' },
        body: '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18"}}',
      },
      { status: 202, contentType: 'application/json', body: '' },
    ]);

    const client = new McpBridgeClient({ url: 'http://127.0.0.1:7331/mcp', fetch });
    await client.initialize();

    expect(client.session).toBe('sess-1');
    expect(calls.map((call) => call.method)).toEqual(['POST', 'POST']);
    expect(JSON.parse(calls[0]?.body ?? '{}')).toMatchObject({ method: 'initialize' });
    expect(JSON.parse(calls[1]?.body ?? '{}')).toEqual({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
  });

  it('echoes the session id on later requests', async () => {
    const { fetch, calls } = stubFetch([
      {
        status: 200,
        contentType: 'application/json',
        headers: { 'Mcp-Session-Id': 'sess-2' },
        body: '{"jsonrpc":"2.0","id":1,"result":{}}',
      },
      { status: 202, contentType: 'application/json', body: '' },
      { status: 200, contentType: 'application/json', body: TOOL_RESULT },
    ]);

    const client = new McpBridgeClient({ url: 'http://127.0.0.1:7331/mcp', fetch });
    await client.initialize();
    await client.callTool('list_applications', { campaign: 'default' });

    expect(calls[2]?.headers['Mcp-Session-Id']).toBe('sess-2');
    expect(JSON.parse(calls[2]?.body ?? '{}')).toEqual({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'list_applications', arguments: { campaign: 'default' } },
    });
  });

  it('requests both JSON and SSE content types', async () => {
    const { fetch, calls } = stubFetch([
      { status: 200, contentType: 'application/json', body: '{"jsonrpc":"2.0","id":1,"result":{}}' },
      { status: 202, contentType: 'application/json', body: '' },
    ]);

    const client = new McpBridgeClient({ url: 'http://127.0.0.1:7331/mcp', fetch });
    await client.initialize();

    expect(calls[0]?.headers.Accept).toBe('application/json, text/event-stream');
    expect(calls[0]?.headers['Content-Type']).toBe('application/json');
  });

  it('decodes an SSE-framed tools/call response', async () => {
    const { fetch } = stubFetch([
      { status: 200, contentType: 'application/json', body: '{"jsonrpc":"2.0","id":1,"result":{}}' },
      { status: 202, contentType: 'application/json', body: '' },
      {
        status: 200,
        contentType: 'text/event-stream',
        body: `event: message\ndata: ${TOOL_RESULT}\n\n`,
      },
    ]);

    const client = new McpBridgeClient({ url: 'http://127.0.0.1:7331/mcp', fetch });
    await client.initialize();
    const result = await client.callTool('list_applications', {});

    expect(result).toEqual({ isError: false, text: ['{"entries":[]}'] });
  });

  it('lists tool names', async () => {
    const { fetch } = stubFetch([
      { status: 200, contentType: 'application/json', body: '{"jsonrpc":"2.0","id":1,"result":{}}' },
      { status: 202, contentType: 'application/json', body: '' },
      {
        status: 200,
        contentType: 'application/json',
        body: '{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"a"},{"name":"b"}]}}',
      },
    ]);

    const client = new McpBridgeClient({ url: 'http://127.0.0.1:7331/mcp', fetch });
    await client.initialize();

    await expect(client.listTools()).resolves.toEqual(['a', 'b']);
  });

  it('throws McpHttpError on a non-2xx status', async () => {
    const { fetch } = stubFetch([{ status: 500, contentType: 'application/json', body: '{}' }]);

    const client = new McpBridgeClient({ url: 'http://127.0.0.1:7331/mcp', fetch });

    await expect(client.initialize()).rejects.toBeInstanceOf(McpHttpError);
  });

  it('surfaces a JSON-RPC error as a thrown message', async () => {
    const { fetch } = stubFetch([
      { status: 200, contentType: 'application/json', body: '{"jsonrpc":"2.0","id":1,"result":{}}' },
      { status: 202, contentType: 'application/json', body: '' },
      {
        status: 200,
        contentType: 'application/json',
        body: '{"jsonrpc":"2.0","id":2,"error":{"code":-32602,"message":"bad params"}}',
      },
    ]);

    const client = new McpBridgeClient({ url: 'http://127.0.0.1:7331/mcp', fetch });
    await client.initialize();

    await expect(client.callTool('x', {})).rejects.toThrow('bad params');
  });

  it('does not call fetch on close() before initialize', async () => {
    const fetch = vi.fn() as unknown as FetchLike;
    const client = new McpBridgeClient({ url: 'http://127.0.0.1:7331/mcp', fetch });

    await client.close();

    expect(fetch).not.toHaveBeenCalled();
  });
});
