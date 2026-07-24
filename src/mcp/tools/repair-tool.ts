import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RepairInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { repairApp, repairAll } from '../../core/repair/repair.js';
import { mcpLogger } from '../logger.js';

export function registerRepair(server: McpServer): void {
  server.tool(
    'repair',
    'Repair application toolhash sidecars, rebuild index and counters',
    RepairInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign, slug: args.slug }, 'tool.repair.start');
        const campaignRoot = resolveCampaignRoot(args.campaign);

        const repairResult = args.slug
          ? await repairApp(resolveAppliedDir(campaignRoot), args.slug)
          : await repairAll(campaignRoot);

        mcpLogger.debug({ campaign: args.campaign, slug: args.slug }, 'tool.repair.done');
        return {
          content: [{ type: 'text', text: JSON.stringify(repairResult, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
