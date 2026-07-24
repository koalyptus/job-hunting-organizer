import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ReadPrepInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { readPrep } from '../../core/prepare/index.js';
import { mcpLogger } from '../logger.js';

export function registerReadPrep(server: McpServer): void {
  server.tool(
    'read_prep',
    'Read an existing pre-interview prep plan for an application',
    ReadPrepInput.shape,
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
