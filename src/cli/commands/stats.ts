import { Command } from 'commander';
import { type GlobalOpts } from '../options.js';
import {
  computeStats,
  renderFullStats,
  renderCompactStats,
  StatsError,
  InvalidSinceError,
} from '../../core/stats/index.js';
import type { CampaignStats, Colorize } from '../../core/types.js';
import {
  resolveCampaignRoot,
  resolveAppliedDir,
  resolveDataRoot,
  listCampaigns,
} from '../../core/paths.js';
import { getRootLogger, logError } from '../../core/logger/logger.js';
import { userSuccess, userError } from '../output.js';
import { bold, cyan, dim, green, yellow, red, statusColor } from '../colors.js';

const cliColorize: Colorize = { bold, cyan, dim, green, yellow, red, statusColor };

/**
 * `jho stats` — campaign snapshot.
 */
export const statsCommand = new Command('stats')
  .description('Show a campaign snapshot: counts by status, role, site, funnel')
  .option('--role <role>', 'filter stats by target role')
  .option('--since <date>', 'only count applications since a date (ISO or relative: 7d, 30d, 90d)')
  .option('--include-notes', 'include LLM-extracted abandonment reasons (costs tokens)')
  .option('--json', 'output as JSON')
  .action(async function (opts) {
    const globals = this.parent?.opts() as GlobalOpts | undefined;
    const explicitCampaign = globals?.campaign;
    const log = getRootLogger().child({
      cmd: 'stats',
      campaign: explicitCampaign ?? '(campaigns)',
    });

    try {
      if (explicitCampaign === undefined) {
        // No campaign specified — show summary for each campaign
        const dataRoot = resolveDataRoot();
        const campaigns = await listCampaigns(dataRoot);

        if (campaigns.length === 0) {
          userSuccess('No campaigns found.');
          return;
        }

        const filterOpts = {
          targetRole: opts.role as string | undefined,
          since: opts.since as string | undefined,
        };

        const results: { name: string; stats: CampaignStats }[] = [];
        for (const c of campaigns) {
          const campaignRoot = resolveCampaignRoot(c.name);
          const appliedDir = resolveAppliedDir(campaignRoot);
          const stats = await computeStats(appliedDir, filterOpts);
          results.push({ name: c.name, stats });
        }

        if (opts.json) {
          userSuccess(JSON.stringify(results, null, 2));
          return;
        }

        process.stdout.write('Campaign stats:\n');
        for (const { name, stats } of results) {
          process.stdout.write(`${renderCompactStats(name, stats, cliColorize)}\n`);
        }
      } else {
        // Single campaign mode
        const campaignRoot = resolveCampaignRoot(explicitCampaign);
        const appliedDir = resolveAppliedDir(campaignRoot);

        const stats = await computeStats(appliedDir, {
          targetRole: opts.role as string | undefined,
          since: opts.since as string | undefined,
        });

        if (opts.json) {
          userSuccess(JSON.stringify(stats, null, 2));
          return;
        }

        if (stats.total === 0) {
          userSuccess('No applications found.');
          return;
        }

        process.stdout.write(`${renderFullStats(explicitCampaign, stats, cliColorize)}\n`);
      }
    } catch (err) {
      if (err instanceof InvalidSinceError) {
        logError(log, err, 'stats.invalid-since');
        log.flush();
        userError(
          `${err.message}\nhint: use an ISO date (2026-01-15) or relative duration (7d, 30d, 90d)`,
        );
        process.exit(1);
      }
      if (err instanceof StatsError) {
        logError(log, err, 'stats.failed');
        log.flush();
        userError(err.message);
        process.exit(1);
      }
      throw err;
    }
  });

statsCommand.addHelpText(
  'after',
  `
Without --campaign, shows a summary for each campaign. Add --campaign <name>
for a detailed snapshot of one campaign.

Examples:
  $ jho stats                        # summary for all campaigns
  $ jho stats --campaign default     # detailed snapshot
  $ jho stats --role frontend-dev    # filter by target role
  $ jho stats --since 2026-01-01     # stats since a date
  $ jho stats --since 30d            # stats for the last 30 days
  $ jho stats --json                 # JSON output
`,
);
