import type { McpServer } from '@modelcontextprotocol/server';
import type { FileStore } from '../../storage/types.js';
import { AnswerQuestionInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { answerQuestion } from '../../workflow/applications/application-qa.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `answer_question` tool on the MCP server.
 * Answer a question for an application and append it to qa.md.
 *
 * @param server - The MCP server instance.
 */
export function registerAnswerQuestion(server: McpServer, _store: FileStore): void {
  server.registerTool(
    'answer_question',
    {
      description: 'Answer a question for an application and append it to qa.md',
      inputSchema: AnswerQuestionInput,
    },
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign, slug: args.slug }, 'tool.answer_question.start');
        const result = await answerQuestion({
          slug: args.slug,
          campaign: args.campaign,
          question: args.question,
          steer: args.steer,
          noSave: args.noSave,
          imagePath: args.imagePath,
        });
        mcpLogger.debug({ slug: args.slug }, 'tool.answer_question.done');
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
