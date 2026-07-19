import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getPackageVersion } from '../core/package.js';
import { mcpLogger } from './logger.js';

/** MCP server name advertised to clients. */
const SERVER_NAME = 'jho-mcp';

/**
 * Create and configure the MCP server.
 * Tools, resources, and prompts are registered by separate modules
 * in subsequent sub-phases (8b–8e).
 */
export function createServer(): McpServer {
  return new McpServer({
    name: SERVER_NAME,
    version: getPackageVersion(),
  });
}

/**
 * Start the MCP server with stdio transport.
 * This is the main entry point called by `bin/jho-mcp`.
 */
export async function startServer(): Promise<void> {
  const server = createServer();

  // Phase 8b: registerTools(server);
  // Phase 8e: registerResources(server);
  // Phase 8e: registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  mcpLogger.info('jho-mcp started');
}
