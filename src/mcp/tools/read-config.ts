import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ReadConfigInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { loadGlobalConfig } from '../../core/config/config.js';
import { redactSecrets } from '../../core/config/config.view.js';
import { mcpLogger } from '../logger.js';

export function registerReadConfig(server: McpServer): void {
  server.tool(
    'read_config',
    'Read global configuration (secrets redacted)',
    ReadConfigInput.shape,
    async () => {
      try {
        mcpLogger.debug('tool.read_config.start');
        const config = redactSecrets(loadGlobalConfig());
        return {
          content: [{ type: 'text', text: JSON.stringify(config, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
