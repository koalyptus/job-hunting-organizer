import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GetRootInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { resolveCampaignRoot } from '../../core/paths.js';
import { mcpLogger } from '../logger.js';

export function registerGetRoot(server: McpServer): void {
  server.tool(
    'get_root',
    'Resolve the campaign root directory path',
    GetRootInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign }, 'tool.get_root.start');
        const root = resolveCampaignRoot(args.campaign);
        return {
          content: [{ type: 'text', text: JSON.stringify({ root }, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
