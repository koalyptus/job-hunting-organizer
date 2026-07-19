import { pino } from 'pino';

/**
 * MCP server logger — stderr only, never stdout.
 * In stdio mode, stdout is reserved for JSON-RPC framing.
 * Pino writes to stderr by default when no transport is specified.
 */
export const mcpLogger = pino({
  level: process.env.JHO_LOG_LEVEL ?? 'info',
});
