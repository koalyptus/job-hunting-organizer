import { Command } from 'commander';
import { mcpLogger } from '../../mcp/logger.js';
import { startServer, UNSAFE_HTTP_ENV_VAR } from '../../mcp/server.js';
import { DEFAULT_HTTP_PORT } from '../../mcp/http-server.js';

/**
 * `jho mcp` — start the MCP server.
 *
 * The server connects to stdio transport by default and runs indefinitely
 * (stdin open = server alive). With `--http`, it serves the MCP v2 Streamable
 * HTTP transport on the given port for browser-extension clients. HTTP mode
 * is disabled unless `JHO_MCP_UNSAFE_HTTP=1` is set.
 */
export const mcpCommand = new Command('mcp')
  .description('Start the MCP server')
  .option('--http', 'Serve MCP over Streamable HTTP instead of stdio')
  .option('--port <port>', 'HTTP port (default: 7331)', Number.parseInt)
  .action(async (opts) => {
    try {
      await startServer({
        transport: opts.http ? 'http' : 'stdio',
        port: opts.port ?? DEFAULT_HTTP_PORT,
      });
    } catch (err) {
      mcpLogger.error({ err }, 'jho-mcp failed to start');
      process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  });

mcpCommand.addHelpText(
  'after',
  `
Examples:
  $ jho mcp                     # start the MCP server (stdio)
  $ jho mcp --http              # serve Streamable HTTP on port 7331 (needs ${UNSAFE_HTTP_ENV_VAR}=1)
  $ jho mcp --http --port 8080  # serve Streamable HTTP on port 8080 (needs ${UNSAFE_HTTP_ENV_VAR}=1)
`,
);
