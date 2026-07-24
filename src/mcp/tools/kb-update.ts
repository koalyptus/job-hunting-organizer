import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KbUpdateInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { syncKnowledgeBase } from '../../core/campaign/kb-ingest.js';
import { resolveCampaignRoot } from '../../core/paths.js';
import { loadCampaignConfig } from '../../core/config/config.js';
import { mcpLogger } from '../logger.js';

export function registerKbUpdate(server: McpServer): void {
  server.tool(
    'kb_update',
    'Re-sync the knowledge base from sources recorded at init',
    KbUpdateInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign }, 'tool.kb_update.start');
        const campaignRoot = resolveCampaignRoot(args.campaign);
        const sources = loadCampaignConfig(args.campaign).knowledgeBase.sources;
        const present = await syncKnowledgeBase(campaignRoot, sources ?? []);
        mcpLogger.debug({ count: present.length }, 'tool.kb_update.done');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: present.length, paths: present }, null, 2),
            },
          ],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
