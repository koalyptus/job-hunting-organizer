import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getConfig } from '../../core/config/config.js';
import { defaultLlmConfig } from '../../core/llm.js';
import { extractJdFromUrl, extractJdFromText } from '../../core/jobs/extract.js';
import { mcpLogger } from '../logger.js';

export function registerExtractJdPrompt(server: McpServer): void {
  server.registerPrompt(
    'extract_jd',
    {
      description: 'Extract structured job description from a URL or raw text',
      argsSchema: {
        campaign: z.string().describe('Campaign name'),
        url: z.string().optional().describe('URL to extract JD from'),
        text: z.string().optional().describe('Raw text to extract JD from'),
      },
    },
    async ({ campaign, url, text }) => {
      try {
        mcpLogger.debug({ campaign, url, text }, 'prompt.extract_jd.start');
        const { global } = getConfig(campaign);
        const llmConfig = defaultLlmConfig(global);

        if (!url && !text) {
          throw new Error('Either url or text must be provided');
        }
        const result = url
          ? await extractJdFromUrl(url, llmConfig)
          : await extractJdFromText(text!, llmConfig);
        return {
          messages: [
            {
              role: 'assistant',
              content: {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            },
          ],
        };
      } catch (err) {
        return {
          messages: [
            {
              role: 'assistant',
              content: {
                type: 'text',
                text: `Error extracting JD: ${err instanceof Error ? err.message : String(err)}`,
              },
            },
          ],
        };
      }
    },
  );
}
