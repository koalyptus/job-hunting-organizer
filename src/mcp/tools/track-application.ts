import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TrackApplicationInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { runTrack } from '../../core/track/track.js';
import { mcpLogger } from '../logger.js';

export function registerTrackApplication(server: McpServer): void {
  server.tool(
    'track_application',
    'Track a job application — create from URL or update by slug',
    TrackApplicationInput.shape,
    async (args) => {
      try {
        mcpLogger.debug(
          { campaign: args.campaign, slug: args.slug, url: args.url },
          'tool.track_application.start',
        );
        const result = await runTrack({
          campaign: args.campaign,
          url: args.url,
          slug: args.slug,
          status: args.status,
          salary: args.salary,
          tags: args.tags,
          targetRole: args.targetRole,
          employmentType: args.employmentType,
          note: args.note,
          steer: args.steer,
          refresh: args.refresh,
          yes: true,
        });
        mcpLogger.debug(
          { slug: result.slug, changed: result.changed },
          'tool.track_application.done',
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
