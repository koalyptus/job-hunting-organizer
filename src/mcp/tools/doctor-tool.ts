import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DoctorInput } from '../schemas.js';
import { handleToolError } from '../error-handler.js';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { diagnoseCampaign, diagnoseApp } from '../../core/doctor/doctor.js';
import { mcpLogger } from '../logger.js';

export function registerDoctor(server: McpServer): void {
  server.tool(
    'doctor',
    'Diagnose campaign or application issues (missing files, invalid frontmatter, toolhash mismatches)',
    DoctorInput.shape,
    async (args) => {
      try {
        mcpLogger.debug({ campaign: args.campaign, slug: args.slug }, 'tool.doctor.start');
        const campaignRoot = resolveCampaignRoot(args.campaign);

        const issues = args.slug
          ? await diagnoseApp(resolveAppliedDir(campaignRoot), args.slug)
          : await diagnoseCampaign(campaignRoot);

        mcpLogger.debug(
          { campaign: args.campaign, slug: args.slug, issueCount: issues.length },
          'tool.doctor.done',
        );
        return {
          content: [{ type: 'text', text: JSON.stringify({ issues }, null, 2) }],
        };
      } catch (err) {
        return handleToolError(err);
      }
    },
  );
}
