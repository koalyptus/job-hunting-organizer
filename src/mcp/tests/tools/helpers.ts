import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

type ToolHandler = (
  args: Record<string, unknown>,
  extra: { signal: AbortSignal },
) => Promise<CallToolResult>;

/**
 * Create a fake MCP server that captures the registered tool callback.
 * Use in unit tests to test tool handler logic without the full MCP protocol.
 * Returns `server` cast to `McpServer` so it can be passed to register functions.
 */
export function fakeServer(): { server: McpServer; getCallback: () => ToolHandler | null } {
  let cb: ToolHandler | null = null;
  return {
    server: {
      tool: (_name: string, _desc: string, _schema: unknown, handler: ToolHandler) => {
        cb = handler;
      },
    } as unknown as McpServer,
    getCallback: () => cb,
  };
}

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
