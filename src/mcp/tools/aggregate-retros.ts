import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AggregateRetrosInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { aggregateRetros } from '../../core/retro/aggregate.js';
import { mcpLogger } from '../logger.js';

export function registerAggregateRetros(server: McpServer): void {
  server.tool(
    'aggregate_retros',
    'Aggregate weak topics across all application retro files for a campaign',
    AggregateRetrosInput.shape,
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
