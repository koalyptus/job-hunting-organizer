import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RenameApplicationInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { renameApplication } from '../../core/applications/rename.js';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { mcpLogger } from '../logger.js';

export function registerRenameApplication(server: McpServer): void {
  server.tool(
    'rename_application',
    'Rename an application folder',
    RenameApplicationInput.shape,
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
