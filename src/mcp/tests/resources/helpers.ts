import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

type ResourceContent = { uri: string; text: string; mimeType: string };
type ResourceHandler = (
  uri: URL,
  params: Record<string, string>,
) => Promise<{ contents: ResourceContent[] }>;
type ListHandler = () => Promise<{ resources: unknown[] }>;

/**
 * Create a fake MCP server that captures the registered resource handler.
 * Use in unit tests to test resource handler logic without the full MCP protocol.
 * Returns `server` cast to `McpServer` so it can be passed to register functions.
 */
export function fakeServer(): {
  server: McpServer;
  getHandler: () => ResourceHandler | null;
  getListHandler: () => ListHandler | null;
} {
  let handler: ResourceHandler | null = null;
  let listHandler: ListHandler | null = null;
  return {
    server: {
      registerResource: (
        _name: string,
        uriOrTemplate: unknown,
        _config: unknown,
        callback: ResourceHandler,
      ) => {
        handler = callback;
        const template = uriOrTemplate as {
          listCallback?: ListHandler;
          _callbacks?: { list?: ListHandler };
        };
        if (typeof template?.listCallback === 'function') {
          listHandler = template.listCallback;
        } else if (typeof template?._callbacks?.list === 'function') {
          listHandler = template._callbacks.list;
        }
      },
    } as unknown as McpServer,
    getHandler: () => handler,
    getListHandler: () => listHandler,
  };
}

export type { ResourceContent };
