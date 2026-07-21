import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { UpdateProfileInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { writeProfile } from '../../core/campaign/profile-writer.js';
import { mcpLogger } from '../logger.js';

export function registerUpdateProfile(server: McpServer): void {
  server.tool(
    'update_profile',
    'Overwrite the campaign profile.md with new markdown content',
    UpdateProfileInput.shape,
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
