import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ReadQaInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { readQa } from '../../core/applications/application-qa.js';
import { mcpLogger } from '../logger.js';

export function registerReadQa(server: McpServer): void {
  server.tool(
    'read_qa',
    'Read existing Q&A entries for an application',
    ReadQaInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign, slug: args.slug }, 'tool.read_qa.start');
        const { slug, campaign } = args;
        const content = await readQa(campaign, slug);
        return {
          content: [{ type: 'text', text: content }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
