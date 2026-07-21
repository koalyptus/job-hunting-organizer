import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { UpdateConfigInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { updateGlobalConfig, clearConfigCache } from '../../core/config/config.js';
import { mcpLogger } from '../logger.js';

export function registerUpdateConfig(server: McpServer): void {
  server.tool(
    'update_config',
    'Update global configuration settings',
    UpdateConfigInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ patch: args.patch }, 'tool.update_config.start');
        updateGlobalConfig(args.patch as Record<string, unknown>);
        clearConfigCache();
        return {
          content: [{ type: 'text', text: JSON.stringify({ status: 'ok' }, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
