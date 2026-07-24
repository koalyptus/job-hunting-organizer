import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AppendRetroInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { appendRetro } from '../../core/retro/retro.js';
import { mcpLogger } from '../logger.js';

export function registerAppendRetro(server: McpServer): void {
  server.tool(
    'append_retro',
    'Append additional weak topics and notes to an existing retro',
    AppendRetroInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign, slug: args.slug }, 'tool.append_retro.start');
        const result = await appendRetro({
          slug: args.slug,
          campaign: args.campaign,
          weakTopics: args.weakTopics ?? [],
          notes: args.notes,
          steer: args.steer,
          status: args.status,
          noCarryOver: args.noCarryOver,
        });
        mcpLogger.debug({ slug: args.slug }, 'tool.append_retro.done');
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
