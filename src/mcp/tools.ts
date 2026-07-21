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
import { registerTrackApplication } from './tools/track-application.js';
import { registerAddInterview } from './tools/add-interview.js';
import { registerMarkInterview } from './tools/mark-interview.js';
import { registerUpdateProfile } from './tools/update-profile.js';
import { registerUpdateConfig } from './tools/update-config.js';
import { registerInit } from './tools/init-tool.js';
import { registerPostMortem } from './tools/post-mortem.js';
import { registerAppendRetro } from './tools/append-retro-tool.js';

/**
 * Register all Phase 8b read-only tools and Phase 8c write tools on the MCP server.
 * Called once from {@link startServer} after server creation.
 *
 * Each tool validates input with its pre-defined Zod schema,
 * calls a `core/` function directly, and returns JSON content.
 * All Phase 8c tools pass `yes: true` to skip interactive prompts.
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
  registerTrackApplication(server);
  registerAddInterview(server);
  registerMarkInterview(server);
  registerUpdateProfile(server);
  registerUpdateConfig(server);
  registerInit(server);
  registerPostMortem(server);
  registerAppendRetro(server);
}
