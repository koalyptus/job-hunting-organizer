import type { McpServer } from '@modelcontextprotocol/server';
import type { FileStore } from '../../storage/types.js';
import { CoverLetterInput, ReadCoverLetterInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { generateCoverLetter, readCoverLetter } from '../../workflow/applications/cover-letter.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `cover_letter` tool on the MCP server.
 * Generate a tailored cover letter for an application.
 *
 * @param server - The MCP server instance.
 */
export function registerCoverLetter(server: McpServer, _store: FileStore): void {
  server.registerTool(
    'cover_letter',
    {
      description: 'Generate a tailored cover letter for an application',
      inputSchema: CoverLetterInput,
    },
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

/**
 * Register the `read_cover_letter` tool on the MCP server.
 * Read an existing saved cover letter for an application.
 *
 * @param server - The MCP server instance.
 */
export function registerReadCoverLetter(server: McpServer, _store: FileStore): void {
  server.registerTool(
    'read_cover_letter',
    {
      description: 'Read an existing saved cover letter for an application',
      inputSchema: ReadCoverLetterInput,
    },
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
