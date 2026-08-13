import type { McpServer } from '@modelcontextprotocol/server';
import type { FileStore } from '../../storage/types.js';
import { ReadCampaignConfigInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { loadCampaignConfig } from '../../core/config/config.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `read_campaign_config` tool on the MCP server.
 * Read campaign configuration (redacted).
 *
 * @param server - The MCP server instance.
 */
export function registerReadCampaignConfig(server: McpServer, _store: FileStore): void {
  server.registerTool(
    'read_campaign_config',
    { description: 'Read campaign configuration (redacted)', inputSchema: ReadCampaignConfigInput },
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
