import { describe, it, expect } from 'vitest';
import { createTestServer, getTextContent, maybeGetTextContent } from './helpers.js';
import type { CallToolResult } from '@modelcontextprotocol/server';

describe('createTestServer', () => {
  it('connects a real client to the server', async () => {
    const { client, server } = await createTestServer();
    expect(server).toBeDefined();
    await client.close();
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
