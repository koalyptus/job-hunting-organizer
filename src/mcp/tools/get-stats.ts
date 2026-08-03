import type { McpServer } from '@modelcontextprotocol/server';
import { GetStatsInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { computeStats } from '../../core/stats/stats.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `get_stats` tool on the MCP server.
 * Compute campaign statistics: counts by status, role, site, employment type, funnel, and this-month delta.
 *
 * @param server - The MCP server instance.
 */
export function registerGetStats(server: McpServer): void {
  server.registerTool(
    'get_stats',
    {
      description:
        'Compute campaign statistics: counts by status, role, site, employment type, funnel, and this-month delta',
      inputSchema: GetStatsInput,
    },
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign }, 'tool.get_stats.start');
        const campaignRoot = resolveCampaignRoot(args.campaign);
        const appliedDir = resolveAppliedDir(campaignRoot);
        const stats = await computeStats(appliedDir, {
          targetRole: args.targetRole,
          since: args.since,
          employmentType: args.employmentType,
        });
        mcpLogger.debug({ campaign: args.campaign }, 'tool.get_stats.done');
        return {
          content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
