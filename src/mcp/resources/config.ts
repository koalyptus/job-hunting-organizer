import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadGlobalConfig } from '../../core/config/config.js';
import { redactSecrets } from '../../core/config/config.view.js';
import { mcpLogger } from '../logger.js';

export function registerConfig(server: McpServer): void {
  server.registerResource(
    'config',
    'jho://config',
    {
      description: 'Global configuration',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        mcpLogger.debug('resource.config.read');
        const config = redactSecrets(loadGlobalConfig());
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(config, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
            },
          ],
        };
      }
    },
  );
}
