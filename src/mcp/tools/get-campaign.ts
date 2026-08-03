import type { McpServer } from "@modelcontextprotocol/server";
import { GetCampaignInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { loadCampaignConfig } from '../../core/config/config.js';
import { redactSecrets } from '../../core/config/config.view.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `get_campaign` tool on the MCP server.
 * Get campaign configuration (secrets redacted).
 *
 * @param server - The MCP server instance.
 */
export function registerGetCampaign(server: McpServer): void {
  server.registerTool('get_campaign', { description: 'Get campaign configuration (secrets redacted)', inputSchema: GetCampaignInput }, async (args) => {
              try {
                mcpLogger.debug({ campaign: args.campaign }, 'tool.get_campaign.start');
                const config = loadCampaignConfig(args.campaign);
                const redactedConfig = redactSecrets(config);
                mcpLogger.debug({ campaign: args.campaign }, 'tool.get_campaign.done');
                return {
                  content: [{ type: 'text', text: JSON.stringify(redactedConfig, null, 2) }],
                };
              } catch (err) {
                return handleToolError(err);
              }
            });
}
