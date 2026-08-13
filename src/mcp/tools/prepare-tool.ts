import type { McpServer } from '@modelcontextprotocol/server';
import type { FileStore } from '../../storage/types.js';
import { PrepareInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { generatePrep, appendTopic } from '../../core/prepare/prepare.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `prepare` tool on the MCP server.
 * Generate or add topics to a pre-interview prep plan.
 *
 * @param server - The MCP server instance.
 */
export function registerPrepare(server: McpServer, _store: FileStore): void {
  server.registerTool(
    'prepare',
    {
      description:
        'Generate or add topics to a pre-interview prep plan. Provide topics to append to an existing plan (steer/days ignored in this mode).',
      inputSchema: PrepareInput,
    },
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
