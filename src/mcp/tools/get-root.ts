import type { McpServer } from '@modelcontextprotocol/server';
import { GetRootInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { resolveCampaignRoot } from '../../core/paths.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `get_root` tool on the MCP server.
 * Resolve the campaign root directory path.
 *
 * @param server - The MCP server instance.
 */
export function registerGetRoot(server: McpServer): void {
  server.registerTool(
    'get_root',
    { description: 'Resolve the campaign root directory path', inputSchema: GetRootInput },
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign }, 'tool.get_root.start');
        const root = resolveCampaignRoot(args.campaign);
        mcpLogger.debug({ root }, 'tool.get_root.done');
        return {
          content: [{ type: 'text', text: JSON.stringify({ root }, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
