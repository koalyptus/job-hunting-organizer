import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RenameCampaignInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { renameCampaign } from '../../core/campaign/rename-campaign.js';
import { mcpLogger } from '../logger.js';

export function registerRenameCampaign(server: McpServer): void {
  server.tool(
    'rename_campaign',
    'Rename a campaign folder',
    RenameCampaignInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ from: args.from, to: args.to }, 'tool.rename_campaign.start');
        await renameCampaign(args.from, args.to);
        mcpLogger.debug({ from: args.from, to: args.to }, 'tool.rename_campaign.done');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ from: args.from, to: args.to, renamed: true }, null, 2),
            },
          ],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
