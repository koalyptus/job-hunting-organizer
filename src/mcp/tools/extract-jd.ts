import type { McpServer } from '@modelcontextprotocol/server';
import type { FileStore } from '../../storage/types.js';
import { ExtractJdInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { getConfig } from '../../lib/config/config.js';
import { defaultLlmConfig } from '../../core/llm.js';
import { extractJdFromUrl, extractJdFromText } from '../../core/jobs/extract.js';
import { mcpLogger } from '../logger.js';

/**
 * Register the `extract_jd` tool on the MCP server.
 * Extract structured job description from a URL or raw text.
 *
 * @param server - The MCP server instance.
 */
export function registerExtractJd(server: McpServer, _store: FileStore): void {
  server.registerTool(
    'extract_jd',
    {
      description: 'Extract structured job description from a URL or raw text',
      inputSchema: ExtractJdInput,
    },
    async (args) => {
      try {
        mcpLogger.debug(
          { campaign: args.campaign, url: args.url, text: args.text },
          'tool.extract_jd.start',
        );
        const { global } = getConfig(args.campaign);
        const llmConfig = defaultLlmConfig(global);

        const { url, text } = args;
        if (!url && !text) {
          throw new Error('Either url or text must be provided');
        }
        const result = url
          ? await extractJdFromUrl(url, llmConfig)
          : await extractJdFromText(text!, llmConfig);
        mcpLogger.debug({ campaign: args.campaign }, 'tool.extract_jd.done');
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
