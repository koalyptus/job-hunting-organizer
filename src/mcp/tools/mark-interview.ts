import type { McpServer } from '@modelcontextprotocol/server';
import type { FileStore } from '../../storage/types.js';
import { MarkInterviewInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { markInterviewStatus, appendInterviewNotes } from '../../core/interviews/interviews.js';
import { resolveCampaignRoot, resolveAppliedDir } from '../../lib/paths.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `mark_interview` tool on the MCP server.
 * Change the status of an existing interview.
 *
 * @param server - The MCP server instance.
 */
export function registerMarkInterview(server: McpServer, _store: FileStore): void {
  server.registerTool(
    'mark_interview',
    { description: 'Change the status of an existing interview', inputSchema: MarkInterviewInput },
    async (args) => {
      try {
        mcpLogger.debug(
          { campaign: args.campaign, slug: args.slug, index: args.index },
          'tool.mark_interview.start',
        );
        const campaignRoot = resolveCampaignRoot(args.campaign);
        const appliedDir = resolveAppliedDir(campaignRoot);
        const sectionNumber = args.index + 1;
        const result = await markInterviewStatus(appliedDir, args.slug, {
          sectionNumber,
          status: args.status,
        });
        if (args.notes) {
          await appendInterviewNotes(appliedDir, args.slug, {
            sectionNumber,
            notes: args.notes,
          });
        }
        mcpLogger.debug({ slug: args.slug, index: args.index }, 'tool.mark_interview.done');
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: result }, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
