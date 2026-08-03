import type { McpServer } from '@modelcontextprotocol/server';
import { ReadProfileInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { resolveCampaignRoot } from '../../core/paths.js';
import { readProfile } from '../../core/campaign/profile-read.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `read_profile` tool on the MCP server.
 * Read the candidate profile for a campaign.
 *
 * @param server - The MCP server instance.
 */
export function registerReadProfile(server: McpServer): void {
  server.registerTool(
    'read_profile',
    { description: 'Read the candidate profile for a campaign', inputSchema: ReadProfileInput },
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign }, 'tool.read_profile.start');
        const campaignRoot = resolveCampaignRoot(args.campaign);
        const profileContent = await readProfile(campaignRoot);
        mcpLogger.debug({ campaign: args.campaign }, 'tool.read_profile.done');
        return {
          content: [{ type: 'text', text: JSON.stringify({ content: profileContent }, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
