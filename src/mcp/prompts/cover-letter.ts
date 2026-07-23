import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { generateCoverLetter } from '../../core/applications/cover-letter.js';
import { mcpLogger } from '../logger.js';

export function registerCoverLetterPrompt(server: McpServer): void {
  server.registerPrompt(
    'cover_letter',
    {
      description: 'Generate a tailored cover letter for an application',
      argsSchema: {
        campaign: z.string().describe('Campaign name'),
        slug: z.string().describe('Application slug'),
      },
    },
    async ({ campaign, slug }) => {
      try {
        mcpLogger.debug({ campaign, slug }, 'prompt.cover_letter.start');
        const result = await generateCoverLetter({ campaign, slug });
        return {
          messages: [
            {
              role: 'assistant',
              content: {
                type: 'text',
                text: result.content,
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
                text: `Error generating cover letter: ${err instanceof Error ? err.message : String(err)}`,
              },
            },
          ],
        };
      }
    },
  );
}
