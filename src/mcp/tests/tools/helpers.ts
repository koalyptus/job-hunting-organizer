import type { CallToolResult } from '@modelcontextprotocol/server';

export { createTestServer } from '../helpers.js';

/**
 * Extract the text content from a tool result, narrowing the type.
 * Use in tests when asserting on `result.content[0].text`.
 */
export function getTextContent(result: CallToolResult): string {
  const item = result.content[0]!;
  if (item.type !== 'text') {
    throw new Error(`Expected text content, got ${item.type}`);
  }
  return item.text;
}

/**
 * Extract the text content from a tool result without throwing on non-text types.
 * Returns the text if present, or undefined for non-text content types.
 */
export function maybeGetTextContent(result: CallToolResult): string | undefined {
  const item = result.content[0];
  if (!item || item.type !== 'text') {
    return undefined;
  }
  return item.text;
}
