import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ListInterviewsInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { listInterviews } from '../../core/interviews/interviews.js';
import { mcpLogger } from '../logger.js';

export function registerListInterviews(server: McpServer): void {
  server.tool(
    'list_interviews',
    'List all interviews for an application',
    ListInterviewsInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign, slug: args.slug }, 'tool.list_interviews.start');
        const campaignRoot = resolveCampaignRoot(args.campaign);
        const appliedDir = resolveAppliedDir(campaignRoot);
        const interviews = await listInterviews(appliedDir, args.slug);
        return {
          content: [{ type: 'text', text: JSON.stringify({ interviews }, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
