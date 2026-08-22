import type { McpServer } from '@modelcontextprotocol/server';
import type { FileStore } from '../../storage/types.js';
import { ListInterviewsInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { resolveCampaignRoot, resolveAppliedDir } from '../../lib/paths.js';
import { listInterviews } from '../../core/interviews/interviews.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `list_interviews` tool on the MCP server.
 * List all interviews for an application.
 *
 * @param server - The MCP server instance.
 */
export function registerListInterviews(server: McpServer, _store: FileStore): void {
  server.registerTool(
    'list_interviews',
    { description: 'List all interviews for an application', inputSchema: ListInterviewsInput },
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign, slug: args.slug }, 'tool.list_interviews.start');
        const campaignRoot = resolveCampaignRoot(args.campaign);
        const appliedDir = resolveAppliedDir(campaignRoot);
        const interviews = await listInterviews(appliedDir, args.slug);
        mcpLogger.debug({ slug: args.slug, count: interviews.length }, 'tool.list_interviews.done');
        return {
          content: [{ type: 'text', text: JSON.stringify({ interviews }, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
