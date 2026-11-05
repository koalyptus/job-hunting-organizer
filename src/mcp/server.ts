import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { McpServer } from '@modelcontextprotocol/server';
import { appendFileSync } from 'node:fs';
import { getPackageVersion } from '../lib/package.js';
import { mcpLogger, getMcpLogPath } from './logger.js';
import { registerTools } from './tools.js';
import { registerResources } from './resources/index.js';
import { registerPrompts } from './prompts/index.js';
import { createStore } from '../storage/index.js';
import { createHttpTransport, startHttpServer, DEFAULT_HTTP_PORT } from './http-server.js';

const SERVER_NAME = 'jho-mcp';

/**
 * Environment variable that must be set to `1` to opt into HTTP transport mode.
 *
 * HTTP mode serves the full unauthenticated MCP tool surface (including write
 * tools) with selective CORS, so it is disabled unless the user explicitly
 * acknowledges that exposure.
 */
export const UNSAFE_HTTP_ENV_VAR = 'JHO_MCP_UNSAFE_HTTP';

/** Options for {@link startServer}. */
export interface StartServerOptions {
  /** Transport to use: 'stdio' (default) or 'http'. */
  transport?: 'stdio' | 'http';
  /** Port for the HTTP transport (default: 7331). */
  port?: number;
}

/**
 * Whether HTTP transport mode has been explicitly opted into via
 * {@link UNSAFE_HTTP_ENV_VAR}.
 *
 * @returns `true` only when `JHO_MCP_UNSAFE_HTTP=1` is set in the environment.
 */
export function isHttpTransportAllowed(): boolean {
  return process.env[UNSAFE_HTTP_ENV_VAR] === '1';
}

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
 * Start the MCP server with the chosen transport and register all tools,
 * resources, and prompts.
 *
 * HTTP mode is refused unless {@link UNSAFE_HTTP_ENV_VAR} is set to `1`;
 * stdio mode is unaffected. A port outside 1–65535 is rejected for both.
 *
 * @param options - Transport selection and HTTP port. Defaults to stdio.
 * @returns Resolves when the server is connected and listening.
 */
export async function startServer(options: StartServerOptions = {}): Promise<void> {
  const { transport = 'stdio', port = DEFAULT_HTTP_PORT } = options;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`invalid port ${String(port)} (expected an integer between 1 and 65535)`);
  }

  if (transport === 'http' && !isHttpTransportAllowed()) {
    throw new Error(
      `Refusing to start MCP over HTTP: ${UNSAFE_HTTP_ENV_VAR}=1 must be set. ` +
        'The HTTP transport is unauthenticated and binds loopback by default.',
    );
  }

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

  if (transport === 'http') {
    const httpTransport = createHttpTransport();
    await server.connect(httpTransport);
    await startHttpServer(httpTransport, port);
    mcpLogger.info(`jho-mcp started (http, port ${port})`);
    return;
  }

  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
  mcpLogger.info('jho-mcp started (stdio)');
}
