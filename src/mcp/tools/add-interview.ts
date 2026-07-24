import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AddInterviewInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { addInterview } from '../../core/interviews/interviews.js';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { mcpLogger } from '../logger.js';

export function registerAddInterview(server: McpServer): void {
  server.tool(
    'add_interview',
    'Add a new interview entry for an application',
    AddInterviewInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign, slug: args.slug }, 'tool.add_interview.start');
        const campaignRoot = resolveCampaignRoot(args.campaign);
        const appliedDir = resolveAppliedDir(campaignRoot);
        const result = await addInterview(appliedDir, args.slug, {
          when: args.when,
          title: args.title,
          type: args.type,
          duration: args.duration,
          interviewers: args.interviewers?.join(', '),
          location: args.location,
        });
        mcpLogger.debug({ slug: args.slug }, 'tool.add_interview.done');
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
