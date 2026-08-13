import type { McpServer } from '@modelcontextprotocol/server';
import type { FileStore } from '../../storage/types.js';
import { ShowApplicationInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { readShowData, readShowFile, ShowError } from '../../core/applications/show.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `show_application` tool on the MCP server.
 * Show a single application: metadata (meta.md) and job description (jd.md).
 *
 * @param server - The MCP server instance.
 */
export function registerShowApplication(server: McpServer, _store: FileStore): void {
  server.registerTool(
    'show_application',
    {
      description: 'Show a single application: metadata (meta.md) and job description (jd.md)',
      inputSchema: ShowApplicationInput,
    },
    async (args) => {
      try {
        mcpLogger.debug(
          { campaign: args.campaign, slug: args.slug },
          'tool.show_application.start',
        );
        const campaignRoot = resolveCampaignRoot(args.campaign);
        const appliedDir = resolveAppliedDir(campaignRoot);

        const { frontmatter, body } = await readShowData(appliedDir, args.slug);

        let jdContent = '';
        try {
          jdContent = await readShowFile(appliedDir, args.slug, 'jd.md');
        } catch (err) {
          if (!(err instanceof ShowError)) {
            throw err;
          }
          // jd.md may not exist yet
        }

        mcpLogger.debug({ slug: args.slug }, 'tool.show_application.done');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ frontmatter, body, jdContent }, null, 2),
            },
          ],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
