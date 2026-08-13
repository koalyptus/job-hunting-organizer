import type { McpServer } from '@modelcontextprotocol/server';
import type { FileStore } from '../../storage/types.js';
import { UpdateProfileInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { writeProfile } from '../../core/campaign/profile-writer.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `update_profile` tool on the MCP server.
 * Overwrite the campaign profile.md with new markdown content.
 *
 * @param server - The MCP server instance.
 */
export function registerUpdateProfile(server: McpServer, _store: FileStore): void {
  server.registerTool(
    'update_profile',
    {
      description: 'Overwrite the campaign profile.md with new markdown content',
      inputSchema: UpdateProfileInput,
    },
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign }, 'tool.update_profile.start');
        const result = await writeProfile(args.campaign, args.content);
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: result }, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
