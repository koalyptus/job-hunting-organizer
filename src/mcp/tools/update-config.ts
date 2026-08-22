import type { McpServer } from '@modelcontextprotocol/server';
import type { FileStore } from '../../storage/types.js';
import { UpdateConfigInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { updateGlobalConfig, clearConfigCache } from '../../lib/config/config.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `update_config` tool on the MCP server.
 * Update global configuration settings.
 *
 * @param server - The MCP server instance.
 */
export function registerUpdateConfig(server: McpServer, _store: FileStore): void {
  server.registerTool(
    'update_config',
    { description: 'Update global configuration settings', inputSchema: UpdateConfigInput },
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
