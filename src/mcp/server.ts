import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { appendFileSync } from 'node:fs';
import { getPackageVersion } from '../core/package.js';
import { mcpLogger, getMcpLogPath } from './logger.js';
import { registerTools } from './tools.js';
import { registerResources } from './resources/index.js';
import { registerPrompts } from './prompts/index.js';

const SERVER_NAME = 'jho-mcp';

export function safeLogFatal(msg: string, err?: unknown): void {
  try {
    const entry =
      JSON.stringify({
        level: 60,
        time: new Date().toISOString(),
        pid: process.pid,
        msg,
        ...(err instanceof Error ? { err: { message: err.message, stack: err.stack } } : {}),
      }) + '\n';
    appendFileSync(getMcpLogPath(), entry);
    return;
  } catch {
    // catch-all error handling for log file fallback
  }
}

export function createServer(): McpServer {
  return new McpServer({
    name: SERVER_NAME,
    version: getPackageVersion(),
  });
}

export async function startServer(): Promise<void> {
  process.on('uncaughtException', (err) => {
    safeLogFatal('uncaughtException', err);
  });
  process.on('unhandledRejection', (reason) => {
    safeLogFatal('unhandledRejection', reason);
  });

  const server = createServer();

  registerTools(server);
  registerResources(server);
  registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  mcpLogger.info('jho-mcp started');
}
