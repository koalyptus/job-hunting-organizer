import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ExtractJdInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { getConfig } from '../../core/config/config.js';
import { defaultLlmConfig } from '../../core/llm.js';
import { extractJdFromUrl, extractJdFromText } from '../../core/jobs/extract.js';
import { mcpLogger } from '../logger.js';

export function registerExtractJd(server: McpServer): void {
  server.tool(
    'extract_jd',
    'Extract structured job description from a URL or raw text',
    ExtractJdInput.shape,
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
