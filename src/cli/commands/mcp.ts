import { Command } from 'commander';
import { startServer } from '../../mcp/server.js';

/**
 * `jho mcp` — start the MCP server.
 */
export const mcpCommand = new Command('mcp')
  .description('Start the MCP server (stdio transport)')
  .action(async () => {
    await startServer();
  });

mcpCommand.addHelpText(
  'after',
  `
Examples:
  $ jho mcp                     # start the MCP server
`,
);
