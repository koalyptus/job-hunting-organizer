import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { answerQuestion } from '../../core/applications/application-qa.js';
import { mcpLogger } from '../logger.js';

export function registerAnswerQuestionPrompt(server: McpServer): void {
  server.registerPrompt(
    'answer_question',
    {
      description: 'Answer a question for an application',
      argsSchema: {
        campaign: z.string().describe('Campaign name'),
        slug: z.string().describe('Application slug'),
        question: z.string().describe('Question to answer'),
      },
    },
    async ({ campaign, slug, question }) => {
      try {
        mcpLogger.debug({ campaign, slug }, 'prompt.answer_question.start');
        const result = await answerQuestion({ campaign, slug, question });
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
                text: `Error answering question: ${err instanceof Error ? err.message : String(err)}`,
              },
            },
          ],
        };
      }
    },
  );
}
