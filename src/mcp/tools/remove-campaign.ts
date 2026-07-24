import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RemoveCampaignInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { removeCampaign } from '../../core/campaign/remove-campaign.js';
import { mcpLogger } from '../logger.js';

export function registerRemoveCampaign(server: McpServer): void {
  server.tool(
    'remove_campaign',
    'Permanently remove a campaign folder — destructive, cannot be undone',
    RemoveCampaignInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign }, 'tool.remove_campaign.start');
        await removeCampaign(args.campaign, { skipConfirm: args.confirm ?? true });
        mcpLogger.debug({ campaign: args.campaign }, 'tool.remove_campaign.done');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ campaign: args.campaign, removed: true }, null, 2),
            },
          ],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
