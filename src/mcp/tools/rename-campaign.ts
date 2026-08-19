import type { McpServer } from '@modelcontextprotocol/server';
import type { FileStore } from '../../storage/types.js';
import { RenameCampaignInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { renameCampaign } from '../../workflow/campaign/rename-campaign.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `rename_campaign` tool on the MCP server.
 * Rename a campaign folder.
 *
 * @param server - The MCP server instance.
 */
export function registerRenameCampaign(server: McpServer, _store: FileStore): void {
  server.registerTool(
    'rename_campaign',
    { description: 'Rename a campaign folder', inputSchema: RenameCampaignInput },
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
