import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AnswerQuestionInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { answerQuestion } from '../../core/applications/application-qa.js';
import { mcpLogger } from '../logger.js';

export function registerAnswerQuestion(server: McpServer): void {
  server.tool(
    'answer_question',
    'Answer a question for an application and append it to qa.md',
    AnswerQuestionInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign, slug: args.slug }, 'tool.answer_question.start');
        const result = await answerQuestion({
          slug: args.slug,
          campaign: args.campaign,
          question: args.question,
          steer: args.steer,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
