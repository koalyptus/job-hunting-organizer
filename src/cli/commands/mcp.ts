import { Command } from 'commander';
import { mcpLogger } from '../../mcp/logger.js';
import { startServer } from '../../mcp/server.js';

/**
 * `jho mcp` — start the MCP server.
 *
 * The server connects to stdio transport and runs indefinitely
 * (stdin open = server alive). It never returns on its own;
 * the process stays alive until stdin closes or SIGTERM.
 */
export const mcpCommand = new Command('mcp')
  .description('Start the MCP server (stdio transport)')
  .action(async () => {
    try {
      await startServer();
    } catch (err) {
      mcpLogger.error({ err }, 'jho-mcp failed to start');
      process.exit(1);
    }
  });

mcpCommand.addHelpText(
  'after',
  `
Examples:
  $ jho mcp                     # start the MCP server
`,
);
