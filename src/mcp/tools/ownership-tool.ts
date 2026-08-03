import type { McpServer } from "@modelcontextprotocol/server";
import { OwnershipInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { renderOwnership } from '../../core/campaign/ownership.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `ownership` tool on the MCP server.
 * Show file ownership rules (which files the tool writes, which you can edit).
 *
 * @param server - The MCP server instance.
 */
export function registerOwnership(server: McpServer): void {
  server.registerTool('ownership', { description: 'Show file ownership rules (which files the tool writes, which you can edit). Returns a human-readable markdown table, not JSON.', inputSchema: OwnershipInput }, async () => {
              try {
                mcpLogger.debug('tool.ownership.start');
                const ownership = renderOwnership({ markdown: true });
                mcpLogger.debug('tool.ownership.done');
                return {
                  content: [{ type: 'text', text: ownership }],
                };
              } catch (err) {
                return handleToolError(err);
              }
            });
}
