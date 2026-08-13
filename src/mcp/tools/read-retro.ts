import type { McpServer } from '@modelcontextprotocol/server';
import type { FileStore } from '../../storage/types.js';
import { ReadRetroInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { showRetro } from '../../core/retro/index.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `read_retro` tool on the MCP server.
 * Read an existing retro/learning plan for an application.
 *
 * @param server - The MCP server instance.
 */
export function registerReadRetro(server: McpServer, _store: FileStore): void {
  server.registerTool(
    'read_retro',
    {
      description: 'Read an existing retro/learning plan for an application',
      inputSchema: ReadRetroInput,
    },
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
