import type { McpServer } from '@modelcontextprotocol/server';
import type { FileStore } from '../../storage/types.js';
import { PostMortemInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { startRetro } from '../../workflow/retro/retro.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `post_mortem` tool on the MCP server.
 * Generate a post-mortem learning plan for an application.
 *
 * @param server - The MCP server instance.
 */
export function registerPostMortem(server: McpServer, _store: FileStore): void {
  server.registerTool(
    'post_mortem',
    {
      description: 'Generate a post-mortem learning plan for an application',
      inputSchema: PostMortemInput,
    },
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
