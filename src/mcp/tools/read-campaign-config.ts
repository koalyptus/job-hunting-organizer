import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ReadCampaignConfigInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { loadCampaignConfig } from '../../core/config/config.js';
import { mcpLogger } from '../logger.js';

export function registerReadCampaignConfig(server: McpServer): void {
  server.tool(
    'read_campaign_config',
    'Read campaign configuration (redacted)',
    ReadCampaignConfigInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign }, 'tool.read_campaign_config.start');
        const config = loadCampaignConfig(args.campaign);
        // Redact secrets
        const redacted = JSON.parse(JSON.stringify(config));
        if (redacted.apiKey) {
          redacted.apiKey = '[REDACTED]';
        }
        if (redacted.token) {
          redacted.token = '[REDACTED]';
        }
        if (redacted.clientSecret) {
          redacted.clientSecret = '[REDACTED]';
        }
        mcpLogger.debug({ campaign: args.campaign }, 'tool.read_campaign_config.done');
        return {
          content: [{ type: 'text', text: JSON.stringify(redacted, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
