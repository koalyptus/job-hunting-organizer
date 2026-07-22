import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { readShowData, readShowFile, ShowError } from '../../core/applications/show.js';
import { mcpLogger } from '../logger.js';

export function registerApplication(server: McpServer): void {
  server.registerResource(
    'application',
    new ResourceTemplate('jho://applications/{campaign}/{slug}', {
      list: async () => ({ resources: [] }),
    }),
    {
      description: 'Single application by campaign and slug',
      mimeType: 'application/json',
    },
    async (uri, { campaign, slug }) => {
      try {
        const campaignStr = Array.isArray(campaign) ? campaign[0] : campaign;
        const slugStr = Array.isArray(slug) ? slug[0] : slug;
        if (!campaignStr || !slugStr) {
          throw new Error('campaign and slug parameters are required');
        }
        mcpLogger.debug({ campaign: campaignStr, slug: slugStr }, 'resource.application.read');
        const campaignRoot = resolveCampaignRoot(campaignStr);
        const appliedDir = resolveAppliedDir(campaignRoot);

        const { frontmatter, body } = await readShowData(appliedDir, slugStr);

        let jdContent = '';
        try {
          jdContent = await readShowFile(appliedDir, slugStr, 'jd.md');
        } catch (err) {
          if (!(err instanceof ShowError)) {
            throw err;
          }
          // jd.md may not exist yet
        }

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ frontmatter, body, jdContent }, null, 2),
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
