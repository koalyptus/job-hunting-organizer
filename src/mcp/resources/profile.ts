import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolveCampaignRoot } from '../../core/paths.js';
import { readProfile } from '../../core/campaign/profile-read.js';
import { mcpLogger } from '../logger.js';

export function registerProfile(server: McpServer): void {
  server.registerResource(
    'profile',
    new ResourceTemplate('jho://profile/{campaign}', {
      list: async () => ({ resources: [] }),
    }),
    {
      description: 'Campaign profile',
      mimeType: 'application/json',
    },
    async (uri, { campaign }) => {
      try {
        const campaignStr = Array.isArray(campaign) ? campaign[0] : campaign;
        if (!campaignStr) {
          throw new Error('campaign parameter is required');
        }
        mcpLogger.debug({ campaign: campaignStr }, 'resource.profile.read');
        const campaignRoot = resolveCampaignRoot(campaignStr);
        const profileContent = await readProfile(campaignRoot);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ content: profileContent }, null, 2),
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
