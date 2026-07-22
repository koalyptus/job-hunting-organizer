import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAnswerPrompt } from './answer.js';
import { registerCoverLetterPrompt } from './cover-letter.js';
import { registerExtractJdPrompt } from './extract-jd.js';
import { registerInterviewPrompt } from './interview.js';
import { registerRetroPrompt } from './retro.js';

/**
 * Register all MCP prompts on the server.
 * Called once from {@link startServer} after server creation.
 *
 * Each prompt generates structured messages for common LLM workflows.
 * Prompts use Zod schemas for argument validation.
 */
export function registerPrompts(server: McpServer): void {
  registerCoverLetterPrompt(server);
  registerInterviewPrompt(server);
  registerAnswerPrompt(server);
  registerExtractJdPrompt(server);
  registerRetroPrompt(server);
}
