import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CoverLetterInput, ReadCoverLetterInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { generateCoverLetter, readCoverLetter } from '../../core/applications/cover-letter.js';
import { mcpLogger } from '../logger.js';

export function registerCoverLetter(server: McpServer): void {
  server.tool(
    'cover_letter',
    'Generate a tailored cover letter for an application',
    CoverLetterInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign, slug: args.slug }, 'tool.cover_letter.start');
        const { slug, campaign } = args;
        const result = await generateCoverLetter({
          slug,
          campaign,
          ...(args.steer ? { steer: args.steer } : {}),
          ...(args.noSave ? { noSave: args.noSave } : {}),
        });
        mcpLogger.debug({ slug, wordCount: result.wordCount }, 'tool.cover_letter.done');
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}

export function registerReadCoverLetter(server: McpServer): void {
  server.tool(
    'read_cover_letter',
    'Read an existing saved cover letter for an application',
    ReadCoverLetterInput.shape,
    async (args) => {
      try {
        mcpLogger.debug(
          { campaign: args.campaign, slug: args.slug },
          'tool.read_cover_letter.start',
        );
        const { slug, campaign } = args;
        const content = await readCoverLetter(campaign, slug);
        mcpLogger.debug({ campaign, slug }, 'tool.read_cover_letter.done');
        return {
          content: [{ type: 'text', text: content }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
