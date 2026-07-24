import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ListCampaignsInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { runListCampaigns } from '../../core/list/list.js';
import { mcpLogger } from '../logger.js';

export function registerListCampaigns(server: McpServer): void {
  server.tool(
    'list_campaigns',
    'List all campaigns under the data root',
    ListCampaignsInput.shape,
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
