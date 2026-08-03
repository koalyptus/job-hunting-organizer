import type { McpServer } from "@modelcontextprotocol/server";
import { RemoveCampaignInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { removeCampaign } from '../../core/campaign/remove-campaign.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `remove_campaign` tool on the MCP server.
 * Permanently removes a campaign folder and clears the config cache.
 *
 * @param server - The MCP server instance.
 */
export function registerRemoveCampaign(server: McpServer): void {
  server.registerTool('remove_campaign', { description: 'Permanently remove a campaign folder — destructive, cannot be undone', inputSchema: RemoveCampaignInput }, async (args) => {
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
            });
}
