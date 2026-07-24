import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PrepareInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { generatePrep } from '../../core/prepare/prepare.js';
import { mcpLogger } from '../logger.js';

export function registerPrepare(server: McpServer): void {
  server.tool(
    'prepare',
    'Generate a pre-interview prep plan for an application',
    PrepareInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign, slug: args.slug }, 'tool.prepare.start');
        const result = await generatePrep({
          slug: args.slug,
          campaign: args.campaign,
          steer: args.steer,
          days: args.days,
        });
        mcpLogger.debug({ slug: args.slug }, 'tool.prepare.done');
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
