import { Command } from 'commander';
import { userWarn } from '../output.js';

/**
 * `jho mcp` — start the MCP server.
 */
export const mcpCommand = new Command('mcp')
  .description('Start the MCP server (stdio transport)')
  .action(() => {
    userWarn('jho mcp: not implemented yet (planned: phase 8)');
    process.exit(1);
  });

mcpCommand.addHelpText(
  'after',
  `
Examples:
  $ jho mcp                     # start the MCP server
`,
);
