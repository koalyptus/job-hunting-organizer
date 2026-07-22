import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { computeStats } from '../../core/stats/stats.js';
import { mcpLogger } from '../logger.js';

export function registerStats(server: McpServer): void {
  server.registerResource(
    'stats',
    new ResourceTemplate('jho://stats/{campaign}', {
      list: async () => ({ resources: [] }),
    }),
    {
      description: 'Campaign statistics',
      mimeType: 'application/json',
    },
    async (uri, { campaign }) => {
      try {
        const campaignStr = Array.isArray(campaign) ? campaign[0] : campaign;
        if (!campaignStr) {
          throw new Error('campaign parameter is required');
        }
        mcpLogger.debug({ campaign: campaignStr }, 'resource.stats.read');
        const campaignRoot = resolveCampaignRoot(campaignStr);
        const appliedDir = resolveAppliedDir(campaignRoot);
        const stats = await computeStats(appliedDir);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(stats, null, 2),
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
