import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PrepareInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { generatePrep, appendTopic } from '../../core/prepare/prepare.js';
import { mcpLogger } from '../logger.js';

export function registerPrepare(server: McpServer): void {
  server.tool(
    'prepare',
    'Generate a pre-interview prep plan for an application',
    PrepareInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign, slug: args.slug }, 'tool.prepare.start');

        if (args.topics && args.topics.length > 0) {
          for (const topic of args.topics) {
            await appendTopic(args.campaign, args.slug, topic);
          }
          mcpLogger.debug({ slug: args.slug, topicCount: args.topics.length }, 'tool.prepare.done');
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    topicsAdded: args.topics,
                    slug: args.slug,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

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
