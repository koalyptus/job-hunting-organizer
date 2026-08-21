import type { McpServer } from '@modelcontextprotocol/server';
import type { FileStore } from '../../storage/types.js';
import { RemoveApplicationInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import {
  deleteApplication,
  ApplicationNotFoundError,
} from '../../workflow/applications/applications.js';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `remove_application` tool on the MCP server.
 * Permanently removes an application folder and cleans up all
 * associated metadata (index entry, toolhash sidecars, collision counters).
 *
 * @param server - The MCP server instance.
 */
export function registerRemoveApplication(server: McpServer, _store: FileStore): void {
  server.registerTool(
    'remove_application',
    {
      description:
        'Permanently remove an application folder — cleans metadata, index, and sidecars',
      inputSchema: RemoveApplicationInput,
    },
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
