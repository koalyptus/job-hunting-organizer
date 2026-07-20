import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerListApplications } from './tools/list-applications.js';
import { registerShowApplication } from './tools/show-application.js';
import { registerListInterviews } from './tools/list-interviews.js';
import { registerReadProfile } from './tools/read-profile.js';
import { registerGetStats } from './tools/get-stats.js';
import { registerGetRoot } from './tools/get-root.js';
import { registerGetCampaign } from './tools/get-campaign.js';
import { registerListCampaigns } from './tools/list-campaigns.js';
import { registerOwnership } from './tools/ownership-tool.js';
import { registerDoctor } from './tools/doctor-tool.js';
import { registerRepair } from './tools/repair-tool.js';

/**
 * Register all Phase 8b read-only tools on the MCP server.
 * Called once from {@link startServer} after server creation.
 *
 * Each tool validates input with its pre-defined Zod schema,
 * calls a `core/` function directly, and returns JSON content.
 * No LLM, no NL pipeline, no interactive prompts.
 */
export function registerTools(server: McpServer): void {
  registerListApplications(server);
  registerShowApplication(server);
  registerListInterviews(server);
  registerReadProfile(server);
  registerGetStats(server);
  registerGetRoot(server);
  registerGetCampaign(server);
  registerListCampaigns(server);
  registerOwnership(server);
  registerDoctor(server);
  registerRepair(server);
}
