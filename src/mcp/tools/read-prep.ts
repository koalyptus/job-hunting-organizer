import type { McpServer } from '@modelcontextprotocol/server';
import type { FileStore } from '../../storage/types.js';
import { ReadPrepInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { readPrep } from '../../core/prepare/index.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `read_prep` tool on the MCP server.
 * Read an existing pre-interview prep plan for an application.
 *
 * @param server - The MCP server instance.
 */
export function registerReadPrep(server: McpServer, _store: FileStore): void {
  server.registerTool(
    'read_prep',
    {
      description: 'Read an existing pre-interview prep plan for an application',
      inputSchema: ReadPrepInput,
    },
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign, slug: args.slug }, 'tool.read_prep.start');
        const content = await readPrep(args.campaign, args.slug);
        mcpLogger.debug({ slug: args.slug }, 'tool.read_prep.done');
        return {
          content: [{ type: 'text', text: content }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
