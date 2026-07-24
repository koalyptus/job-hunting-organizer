import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ReadRetroInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { showRetro } from '../../core/retro/index.js';
import { mcpLogger } from '../logger.js';

export function registerReadRetro(server: McpServer): void {
  server.tool(
    'read_retro',
    'Read an existing retro/learning plan for an application',
    ReadRetroInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign, slug: args.slug }, 'tool.read_retro.start');
        const content = await showRetro(args.campaign, args.slug);
        mcpLogger.debug({ slug: args.slug }, 'tool.read_retro.done');
        return {
          content: [{ type: 'text', text: content }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
