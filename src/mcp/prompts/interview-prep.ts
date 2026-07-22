import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { generatePrep } from '../../core/prepare/prepare.js';
import { mcpLogger } from '../logger.js';

export function registerInterviewPrepPrompt(server: McpServer): void {
  server.registerPrompt(
    'interview_prep',
    {
      description: 'Generate a pre-interview prep plan for an application',
      argsSchema: {
        campaign: z.string().describe('Campaign name'),
        slug: z.string().describe('Application slug'),
      },
    },
    async ({ campaign, slug }) => {
      try {
        mcpLogger.debug({ campaign, slug }, 'prompt.interview_prep.start');
        const result = await generatePrep({ campaign, slug });
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
                text: `Error generating interview prep: ${err instanceof Error ? err.message : String(err)}`,
              },
            },
          ],
        };
      }
    },
  );
}
