import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

type PromptContent = { type: 'text'; text: string };
type PromptMessage = { role: string; content: PromptContent };
type PromptHandler = (args: {
  campaign: string;
  [key: string]: string;
}) => Promise<{ messages: PromptMessage[] }>;

/**
 * Create a fake MCP server that captures the registered prompt handler.
 * Use in unit tests to test prompt handler logic without the full MCP protocol.
 * Returns `server` cast to `McpServer` so it can be passed to register functions.
 */
export function fakeServer(): { server: McpServer; getHandler: () => PromptHandler | null } {
  let handler: PromptHandler | null = null;
  return {
    server: {
      registerPrompt: (_name: string, _config: unknown, callback: PromptHandler) => {
        handler = callback;
      },
    } as unknown as McpServer,
    getHandler: () => handler,
  };
}

export type { PromptContent, PromptMessage };
