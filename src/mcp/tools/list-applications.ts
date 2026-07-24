import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ListApplicationsInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { runListApplications } from '../../core/list/list.js';
import { mcpLogger } from '../logger.js';

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
