import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PostMortemInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { startRetro } from '../../core/retro/retro.js';
import { mcpLogger } from '../logger.js';

export function registerPostMortem(server: McpServer): void {
  server.tool(
    'post_mortem',
    'Generate a post-mortem learning plan for an application',
    PostMortemInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign, slug: args.slug }, 'tool.post_mortem.start');
        const result = await startRetro({
          slug: args.slug,
          campaign: args.campaign,
          weakTopics: args.weakTopics ?? [],
          notes: args.notes,
          steer: args.steer,
          status: args.status,
        });
        mcpLogger.debug({ slug: args.slug }, 'tool.post_mortem.done');
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
