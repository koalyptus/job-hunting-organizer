import type { McpServer } from '@modelcontextprotocol/server';
import type { FileStore } from '../../storage/types.js';
import { AggregateRetrosInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { resolveCampaignRoot, resolveAppliedDir } from '../../lib/paths.js';
import { aggregateRetros } from '../../workflow/retro/aggregate.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `aggregate_retros` tool on the MCP server.
 * Aggregate weak topics across all application retro files for a campaign.
 *
 * @param server - The MCP server instance.
 */
export function registerAggregateRetros(server: McpServer, _store: FileStore): void {
  server.registerTool(
    'aggregate_retros',
    {
      description: 'Aggregate weak topics across all application retro files for a campaign',
      inputSchema: AggregateRetrosInput,
    },
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign }, 'tool.aggregate_retros.start');
        const campaignRoot = resolveCampaignRoot(args.campaign);
        const appliedDir = resolveAppliedDir(campaignRoot);
        const result = await aggregateRetros(appliedDir, {
          role: args.targetRole,
          includeAbandoned: args.includeAbandoned,
        });
        mcpLogger.debug({ campaign: args.campaign }, 'tool.aggregate_retros.done');
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
