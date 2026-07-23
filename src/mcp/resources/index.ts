import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerApplication } from './application.js';
import { registerApplications } from './applications.js';
import { registerConfig } from './config.js';
import { registerProfile } from './profile.js';
import { registerStats } from './stats.js';

/**
 * Register all MCP resources on the server.
 * Called once from {@link startServer} after server creation.
 *
 * Each resource exposes read-only data that clients can subscribe to.
 * Resources use URI templates with campaign parameters where applicable.
 */
export function registerResources(server: McpServer): void {
  registerApplications(server);
  registerApplication(server);
  registerProfile(server);
  registerConfig(server);
  registerStats(server);
}
