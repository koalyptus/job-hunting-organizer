import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ListApplicationsInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { runListApplications } from '../../core/list/list.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `list_applications` tool on the MCP server.
 * List applications with optional status, tags, role, and employment type filters.
 *
 * @param server - The MCP server instance.
 */
export function registerListApplications(server: McpServer): void {
  server.tool(
    'list_applications',
    'List applications with optional status, tags, role, and employment type filters',
    ListApplicationsInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign }, 'tool.list_applications.start');
        const { entries } = await runListApplications(args.campaign, {
          status: args.status,
          targetRole: args.targetRole,
          employmentType: args.employmentType,
          tags: args.tags,
          filter: args.filter,
        });
        mcpLogger.debug({ count: entries.length }, 'tool.list_applications.done');
        return {
          content: [{ type: 'text', text: JSON.stringify({ entries }, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
