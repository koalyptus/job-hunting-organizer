import type { McpServer } from '@modelcontextprotocol/server';
import type { FileStore } from '../../storage/types.js';
import { RenameApplicationInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { renameApplication } from '../../workflow/applications/rename.js';
import { resolveCampaignRoot, resolveAppliedDir } from '../../lib/paths.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `rename_application` tool on the MCP server.
 * Rename an application folder.
 *
 * @param server - The MCP server instance.
 */
export function registerRenameApplication(server: McpServer, _store: FileStore): void {
  server.registerTool(
    'rename_application',
    { description: 'Rename an application folder', inputSchema: RenameApplicationInput },
    async (args) => {
      try {
        mcpLogger.debug(
          { campaign: args.campaign, from: args.from, to: args.to },
          'tool.rename_application.start',
        );
        const appliedDir = resolveAppliedDir(resolveCampaignRoot(args.campaign));
        await renameApplication(appliedDir, args.from, args.to);
        mcpLogger.debug({ from: args.from, to: args.to }, 'tool.rename_application.done');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ from: args.from, to: args.to, renamed: true }, null, 2),
            },
          ],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
