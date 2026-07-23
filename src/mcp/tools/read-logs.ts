import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ReadLogsInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { resolveConfigHome } from '../../core/paths.js';
import { DEFAULT_LOG_FILENAME } from '../../core/types.js';
import { mcpLogger } from '../logger.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function registerReadLogs(server: McpServer): void {
  server.tool(
    'read_logs',
    'Read the log file with optional filtering (tail, level, JSON format)',
    ReadLogsInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ tail: args.tail, level: args.level }, 'tool.read_logs.start');
        const configHome = resolveConfigHome();
        const logFile = resolve(configHome, DEFAULT_LOG_FILENAME);

        if (!existsSync(logFile)) {
          return {
            content: [{ type: 'text', text: `No log file at ${logFile}\n(Run a command first.)` }],
            isError: true,
          };
        }

        const content = readFileSync(logFile, 'utf8');
        const allLines = content.split('\n').filter((line) => line.trim() !== '');

        // Apply --level filter (minimum level: include entries >= minLevel)
        let filteredLines = allLines;
        if (args.level !== undefined) {
          const levelMap: Record<string, number> = {
            fatal: 60,
            error: 50,
            warn: 40,
            info: 30,
            debug: 20,
            trace: 10,
          };
          const minLevel = levelMap[args.level.toLowerCase()] ?? 30;
          filteredLines = allLines.filter((line) => {
            try {
              const entry = JSON.parse(line) as { level?: number };
              return typeof entry.level === 'number' && entry.level >= minLevel;
            } catch {
              return false;
            }
          });
        }

        // Apply --tail
        const lines = args.tail !== undefined ? filteredLines.slice(-args.tail) : filteredLines;

        if (lines.length === 0) {
          return {
            content: [{ type: 'text', text: '' }],
          };
        }

        if (args.json) {
          return {
            content: [{ type: 'text', text: lines.join('\n') }],
          };
        }

        // Return raw lines without pino-pretty formatting (MCP clients can format if needed)
        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
