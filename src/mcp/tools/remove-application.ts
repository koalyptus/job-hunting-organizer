import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RemoveApplicationInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import {
  deleteApplication,
  ApplicationNotFoundError,
} from '../../core/applications/applications.js';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { mcpLogger } from '../logger.js';

export function registerRemoveApplication(server: McpServer): void {
  server.tool(
    'remove_application',
    'Permanently remove an application folder',
    RemoveApplicationInput.shape,
    async (args) => {
      try {
        mcpLogger.debug(
          { campaign: args.campaign, slug: args.slug },
          'tool.remove_application.start',
        );
        const appliedDir = resolveAppliedDir(resolveCampaignRoot(args.campaign));
        const deleted = await deleteApplication(appliedDir, args.slug);
        if (!deleted) {
          throw new ApplicationNotFoundError(args.slug);
        }
        mcpLogger.debug({ slug: args.slug }, 'tool.remove_application.done');
        return {
          content: [
            { type: 'text', text: JSON.stringify({ slug: args.slug, removed: true }, null, 2) },
          ],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
