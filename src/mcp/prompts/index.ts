import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAnswerQuestionPrompt } from './answer-question.js';
import { registerCoverLetterPrompt } from './cover-letter.js';
import { registerExtractJdPrompt } from './extract-jd.js';
import { registerInterviewPrepPrompt } from './interview-prep.js';
import { registerPostMortemPrompt } from './post-mortem.js';

/**
 * Register all MCP prompts on the server.
 * Called once from {@link startServer} after server creation.
 *
 * Each prompt generates structured messages for common LLM workflows.
 * Prompts use Zod schemas for argument validation.
 */
export function registerPrompts(server: McpServer): void {
  registerCoverLetterPrompt(server);
  registerInterviewPrepPrompt(server);
  registerAnswerQuestionPrompt(server);
  registerExtractJdPrompt(server);
  registerPostMortemPrompt(server);
}
