import type { McpServer } from '@modelcontextprotocol/server';
import type { FileStore } from '../../storage/types.js';
import { RepairInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { repairApp, repairAll } from '../../core/repair/repair.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `repair` tool on the MCP server.
 * Repair application toolhash sidecars, rebuild index and counters.
 *
 * @param server - The MCP server instance.
 */
export function registerRepair(server: McpServer, _store: FileStore): void {
  server.registerTool(
    'repair',
    {
      description: 'Repair application toolhash sidecars, rebuild index and counters',
      inputSchema: RepairInput,
    },
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
