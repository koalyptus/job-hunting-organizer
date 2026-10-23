import { describe, expect, it } from 'vitest';
import {
  buildNotification,
  buildRequest,
  decodeJsonRpcMessage,
  decodeToolResult,
  parseSseDataLine,
  parseSsePayloads,
  readSessionId,
} from '../protocol';

describe('parseSseDataLine', () => {
  it('extracts the payload after "data:"', () => {
    expect(parseSseDataLine('data: {"a":1}')).toBe('{"a":1}');
  });

  it('strips the single optional space after the colon', () => {
    expect(parseSseDataLine('data:{"a":1}')).toBe('{"a":1}');
  });

  it('returns null for non-data lines', () => {
    expect(parseSseDataLine('event: message')).toBeNull();
    expect(parseSseDataLine(': keep-alive')).toBeNull();
  });

  it('returns an empty string for an empty data line', () => {
    expect(parseSseDataLine('data:')).toBe('');
  });
});

describe('parseSsePayloads', () => {
  it('collects every data payload in order', () => {
    const body = ['event: message', 'data: {"id":1}', '', 'data: {"id":2}', ''].join('\n');

    expect(parseSsePayloads(body)).toEqual(['{"id":1}', '{"id":2}']);
  });

  it('handles CRLF line endings', () => {
    expect(parseSsePayloads('data: {"id":1}\r\n\r\n')).toEqual(['{"id":1}']);
  });

  it('skips empty and non-data lines', () => {
    expect(parseSsePayloads('event: message\n: comment\ndata:\n\ndata: {"id":1}\n')).toEqual([
      '{"id":1}',
    ]);
  });
});

describe('decodeJsonRpcMessage', () => {
  it('decodes an application/json body', () => {
    const message = decodeJsonRpcMessage(
      'application/json',
      '{"jsonrpc":"2.0","id":1,"result":{}}',
    );

    expect(message).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
  });

  it('decodes a text/event-stream body', () => {
    const message = decodeJsonRpcMessage(
      'text/event-stream',
      'event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"ok":true}}\n\n',
    );

    expect(message).toEqual({ jsonrpc: '2.0', id: 2, result: { ok: true } });
  });

  it('skips non-JSON frames and keeps scanning', () => {
    const message = decodeJsonRpcMessage(
      'text/event-stream',
      ': keep-alive\n\ndata: {"jsonrpc":"2.0","id":3,"error":{"code":-1,"message":"x"}}\n\n',
    );

    expect(message?.id).toBe(3);
    expect(message?.error?.message).toBe('x');
  });

  it('returns null when no frame decodes', () => {
    expect(decodeJsonRpcMessage('text/event-stream', ': keep-alive\n\n')).toBeNull();
  });
});

describe('decodeToolResult', () => {
  it('returns text blocks and a false error flag', () => {
    const result = decodeToolResult({
      content: [
        { type: 'text', text: '{"entries":[]}' },
        { type: 'text', text: 'trailing' },
      ],
    });

    expect(result).toEqual({ isError: false, text: ['{"entries":[]}', 'trailing'] });
  });

  it('flags isError and drops non-text blocks', () => {
    const result = decodeToolResult({
      isError: true,
      content: [{ type: 'image', data: 'x' }, { type: 'text', text: 'boom' }],
    });

    expect(result).toEqual({ isError: true, text: ['boom'] });
  });

  it('tolerates a missing content array', () => {
    expect(decodeToolResult(undefined)).toEqual({ isError: false, text: [] });
  });
});

describe('readSessionId', () => {
  it('reads the mcp-session-id header case-insensitively', () => {
    expect(readSessionId(new Headers({ 'Mcp-Session-Id': 'abc' }))).toBe('abc');
  });

  it('returns undefined when the header is absent or empty', () => {
    expect(readSessionId(new Headers())).toBeUndefined();
    expect(readSessionId(new Headers({ 'Mcp-Session-Id': '' }))).toBeUndefined();
  });
});

describe('envelope builders', () => {
  it('omits params when none are supplied', () => {
    expect(buildRequest(1, 'initialize')).toEqual({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  });

  it('includes params when supplied', () => {
    expect(buildRequest(2, 'tools/call', { name: 'x' })).toEqual({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'x' },
    });
  });

  it('builds notifications without an id', () => {
    expect(buildNotification('notifications/initialized')).toEqual({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
  });
});
