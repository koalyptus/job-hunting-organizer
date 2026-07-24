import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InitInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { runInit } from '../../core/init/wizard.js';
import { mcpLogger } from '../logger.js';

export function registerInit(server: McpServer): void {
  server.tool(
    'init',
    'Initialize a new campaign with optional CV, GitHub, and LinkedIn',
    InitInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign }, 'tool.init.start');
        await runInit({
          name: args.campaign,
          cv: args.cvPath,
          github: args.githubUser,
          linkedin: args.linkedinUrl,
          yes: true,
        });
        mcpLogger.debug({ campaign: args.campaign }, 'tool.init.done');
        return {
          content: [{ type: 'text', text: JSON.stringify({ status: 'ok' }, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
