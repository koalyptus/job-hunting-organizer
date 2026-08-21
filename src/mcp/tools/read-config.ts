import type { McpServer } from '@modelcontextprotocol/server';
import type { FileStore } from '../../storage/types.js';
import { ReadConfigInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { loadGlobalConfig } from '../../lib/config/config.js';
import { redactSecrets } from '../../lib/config/config.view.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `read_config` tool on the MCP server.
 * Read global configuration (secrets redacted).
 *
 * @param server - The MCP server instance.
 */
export function registerReadConfig(server: McpServer, _store: FileStore): void {
  server.registerTool(
    'read_config',
    { description: 'Read global configuration (secrets redacted)', inputSchema: ReadConfigInput },
    async () => {
      try {
        mcpLogger.debug('tool.read_config.start');
        const config = redactSecrets(loadGlobalConfig());
        mcpLogger.debug('tool.read_config.done');
        return {
          content: [{ type: 'text', text: JSON.stringify(config, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
