import { Command } from 'commander';

/**
 * `jho mcp` — start the MCP server.
 */
export const mcpCommand = new Command('mcp')
  .description('Start the MCP server (stdio transport)')
  .action(() => {
    process.stderr.write('jho mcp: not implemented yet (planned: phase 8)\n');
    process.exit(1);
  });

mcpCommand.addHelpText(
  'after',
  `
Examples:
  $ jho mcp                     # start the MCP server
`,
);
