import { describe, it, expect } from 'vitest';
import { fakeServer, getTextContent, maybeGetTextContent } from './helpers.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

describe('fakeServer', () => {
  it('returns null callback initially', () => {
    const { getCallback } = fakeServer();
    expect(getCallback()).toBeNull();
  });

  it('captures the registered tool callback', () => {
    const { server, getCallback } = fakeServer();
    const handler = async () => ({ content: [{ type: 'text' as const, text: 'ok' }] });
    server.tool('test', 'desc', {}, handler);
    expect(getCallback()).toBe(handler);
  });
});

describe('getTextContent', () => {
  it('returns text from text content', () => {
    const result: CallToolResult = {
      content: [{ type: 'text', text: 'hello' }],
    };
    expect(getTextContent(result)).toBe('hello');
  });

  it('throws for non-text content type', () => {
    const result: CallToolResult = {
      content: [{ type: 'image', data: 'base64...', mimeType: 'image/png' }],
    };
    expect(() => getTextContent(result)).toThrow('Expected text content, got image');
  });

  it('throws for empty content array', () => {
    const result: CallToolResult = { content: [] };
    expect(() => getTextContent(result)).toThrow();
  });
});

describe('maybeGetTextContent', () => {
  it('returns text from text content', () => {
    const result: CallToolResult = {
      content: [{ type: 'text', text: 'hello' }],
    };
    expect(maybeGetTextContent(result)).toBe('hello');
  });

  it('returns undefined for non-text content type', () => {
    const result: CallToolResult = {
      content: [{ type: 'image', data: 'base64...', mimeType: 'image/png' }],
    };
    expect(maybeGetTextContent(result)).toBeUndefined();
  });

  it('returns undefined for empty content array', () => {
    const result: CallToolResult = { content: [] };
    expect(maybeGetTextContent(result)).toBeUndefined();
  });
});
