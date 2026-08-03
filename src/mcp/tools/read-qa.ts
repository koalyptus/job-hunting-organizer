import type { McpServer } from '@modelcontextprotocol/server';
import { ReadQaInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { readQa } from '../../core/applications/application-qa.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `read_qa` tool on the MCP server.
 * Read existing Q&A entries for an application.
 *
 * @param server - The MCP server instance.
 */
export function registerReadQa(server: McpServer): void {
  server.registerTool(
    'read_qa',
    { description: 'Read existing Q&A entries for an application', inputSchema: ReadQaInput },
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign, slug: args.slug }, 'tool.read_qa.start');
        const content = await readQa(args.campaign, args.slug);
        mcpLogger.debug({ slug: args.slug }, 'tool.read_qa.done');
        return {
          content: [{ type: 'text', text: content }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
