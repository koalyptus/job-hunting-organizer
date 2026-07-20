import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GetCampaignInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { loadCampaignConfig } from '../../core/config/config.js';
import { redactSecrets } from '../../core/config/config.view.js';
import { mcpLogger } from '../logger.js';

export function registerGetCampaign(server: McpServer): void {
  server.tool(
    'get_campaign',
    'Get campaign configuration (secrets redacted)',
    GetCampaignInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign }, 'tool.get_campaign.start');
        const config = loadCampaignConfig(args.campaign);
        const redactedConfig = redactSecrets(config);
        return {
          content: [{ type: 'text', text: JSON.stringify(redactedConfig, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
