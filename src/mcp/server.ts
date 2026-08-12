import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { McpServer } from '@modelcontextprotocol/server';
import { appendFileSync } from 'node:fs';
import { getPackageVersion } from '../core/package.js';
import { mcpLogger, getMcpLogPath } from './logger.js';
import { registerTools } from './tools.js';
import { registerResources } from './resources/index.js';
import { registerPrompts } from './prompts/index.js';
import { createStore } from '../storage/index.js';

const SERVER_NAME = 'jho-mcp';

/**
 * Write a fatal-level log entry directly to the MCP log file.
 * Used as a last-resort fallback for uncaught exceptions and unhandled rejections.
 *
 * @param msg - The error message to log.
 * @param err - The associated error object, if any.
 */
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

/**
 * Create and return a configured MCP server instance.
 *
 * @returns The new MCP server.
 */
export function createServer(): McpServer {
  return new McpServer({
    name: SERVER_NAME,
    version: getPackageVersion(),
  });
}

/**
 * Start the MCP server with stdio transport and register all tools, resources, and prompts.
 *
 * @returns Resolves when the server is connected and listening.
 */
export async function startServer(): Promise<void> {
  process.on('uncaughtException', (err) => {
    safeLogFatal('uncaughtException', err);
  });
  process.on('unhandledRejection', (reason) => {
    safeLogFatal('unhandledRejection', reason);
  });

  // Bootstrap storage: build the store once at startup and thread it
  // explicitly into the tool constructors. Tools accept but do not consume
  // it yet — wiring only; core domains switch to the store later.
  const store = createStore();

  const server = createServer();

  registerTools(server, store);
  registerResources(server);
  registerPrompts(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  mcpLogger.info('jho-mcp started');
}
