import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CoverLetterInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { generateCoverLetter } from '../../core/applications/cover-letter.js';
import { mcpLogger } from '../logger.js';

export function registerCoverLetter(server: McpServer): void {
  server.tool(
    'cover_letter',
    'Generate a tailored cover letter for an application',
    CoverLetterInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign, slug: args.slug }, 'tool.cover_letter.start');
        const result = await generateCoverLetter({
          slug: args.slug,
          campaign: args.campaign,
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
