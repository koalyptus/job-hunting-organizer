import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runListApplications } from '../../core/list/list.js';
import { mcpLogger } from '../logger.js';

export function registerApplications(server: McpServer): void {
  server.registerResource(
    'applications',
    new ResourceTemplate('jho://applications/{campaign}', {
      list: async () => ({ resources: [] }),
    }),
    {
      description: 'List all applications in a campaign',
      mimeType: 'application/json',
    },
    async (uri, { campaign }) => {
      try {
        const campaignStr = Array.isArray(campaign) ? campaign[0] : campaign;
        if (!campaignStr) {
          throw new Error('campaign parameter is required');
        }
        mcpLogger.debug({ campaign: campaignStr }, 'resource.applications.read');
        const { entries } = await runListApplications(campaignStr, {});
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ entries }, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
            },
          ],
        };
      }
    },
  );
}
