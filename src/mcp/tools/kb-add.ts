import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { KbAddInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { ingestKnowledgeBase } from '../../core/campaign/kb-ingest.js';
import { resolveCampaignRoot } from '../../core/paths.js';
import { resolve } from 'node:path';
import { loadCampaignConfig, updateCampaignConfig } from '../../core/config/config.js';
import { mcpLogger } from '../logger.js';

export function registerKbAdd(server: McpServer): void {
  server.tool(
    'kb_add',
    'Copy knowledge-base docs (PDF, DOCX, MD, TXT) into the campaign',
    KbAddInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign, paths: args.paths }, 'tool.kb_add.start');
        const campaignRoot = resolveCampaignRoot(args.campaign);
        const all: string[] = [];
        const newSources: string[] = [];

        for (const p of args.paths) {
          const resolved = resolve(campaignRoot, p);
          const copied = await ingestKnowledgeBase(campaignRoot, resolved);
          all.push(...copied);
          newSources.push(resolved);
        }

        // Update knowledgeBase.sources with successfully added sources (deduped)
        if (newSources.length > 0) {
          const config = loadCampaignConfig(args.campaign);
          const existingSources = config.knowledgeBase?.sources ?? [];
          const mergedSources = Array.from(new Set([...existingSources, ...newSources]));
          updateCampaignConfig(args.campaign, {
            knowledgeBase: { ...config.knowledgeBase, sources: mergedSources },
          });
        }

        mcpLogger.debug({ count: all.length }, 'tool.kb_add.done');
        return {
          content: [
            { type: 'text', text: JSON.stringify({ copied: all.length, paths: all }, null, 2) },
          ],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
