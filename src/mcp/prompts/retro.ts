import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { startRetro } from '../../core/retro/retro.js';
import { mcpLogger } from '../logger.js';

export function registerRetroPrompt(server: McpServer): void {
  server.registerPrompt(
    'retro',
    {
      description: 'Generate a post-mortem learning plan for an application',
      argsSchema: {
        campaign: z.string().describe('Campaign name'),
        slug: z.string().describe('Application slug'),
      },
    },
    async ({ campaign, slug }) => {
      try {
        mcpLogger.debug({ campaign, slug }, 'prompt.retro.start');
        const result = await startRetro({ campaign, slug, weakTopics: [] });
        return {
          messages: [
            {
              role: 'assistant',
              content: {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            },
          ],
        };
      } catch (err) {
        return {
          messages: [
            {
              role: 'assistant',
              content: {
                type: 'text',
                text: `Error generating retro: ${err instanceof Error ? err.message : String(err)}`,
              },
            },
          ],
        };
      }
    },
  );
}
