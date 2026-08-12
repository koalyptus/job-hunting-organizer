import type { McpServer } from '@modelcontextprotocol/server';
import type { FileStore } from '../../storage/types.js';
import { ListCampaignsInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { runListCampaigns } from '../../core/list/list.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `list_campaigns` tool on the MCP server.
 * List all campaigns under the data root.
 *
 * @param server - The MCP server instance.
 */
export function registerListCampaigns(server: McpServer, _store: FileStore): void {
  server.registerTool(
    'list_campaigns',
    { description: 'List all campaigns under the data root', inputSchema: ListCampaignsInput },
    async () => {
      try {
        mcpLogger.debug('tool.list_campaigns.start');
        const { campaigns } = await runListCampaigns();
        mcpLogger.debug({ count: campaigns.length }, 'tool.list_campaigns.done');
        return {
          content: [{ type: 'text', text: JSON.stringify({ campaigns }, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
