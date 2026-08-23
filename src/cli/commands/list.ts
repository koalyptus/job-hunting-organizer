import { Command } from 'commander';
import { collectTags, type GlobalOpts } from '../options.js';
import {
  runListCampaigns,
  runListApplications,
  ListError,
  InvalidListStatusError,
} from '../../core/list/index.js';
import { findCampaignFromCwd, resolveDataRoot } from '../../lib/paths.js';
import { APPLICATION_STATUSES, EMPLOYMENT_TYPES } from '../../workflow/applications/types.js';
import type { EmploymentType } from '../../workflow/applications/types.js';
import { getRootLogger, logError } from '../../lib/logger/logger.js';
import { userOutput, userError } from '../output.js';
import { bold, cyan, dim, statusColor } from '../colors.js';

/**
 * `jho list` — list campaigns (no arg) or applications (with --campaign).
 */
export const listCommand = new Command('list')
  .description('List campaigns, or applications within a campaign')
  .option('--status <status>', 'filter by status (requires --campaign or campaign folder)')
  .option(
    '--tags <tag>',
    'filter by tag, repeatable (requires --campaign or campaign folder)',
    collectTags,
    [],
  )
  .option('--role <role>', 'filter by target role (requires --campaign or campaign folder)')
  .option(
    '--employment-type <type>',
    'filter by employment type (permanent|temp|contract|casual|part-time)',
  )
  .option('--filter <term>', 'filter by arbitrary text (case-insensitive)')
  .option('--json', 'output as JSON')
  .action(async function (opts) {
    const globals = this.parent?.opts() as GlobalOpts | undefined;
    const explicitCampaign = globals?.campaign;
    const inferredCampaign =
      explicitCampaign ?? findCampaignFromCwd(process.cwd(), resolveDataRoot());
    const log = getRootLogger().child({ cmd: 'list', campaign: inferredCampaign ?? '(campaigns)' });

    // Validate employment type early
    if (
      opts.employmentType !== undefined &&
      !EMPLOYMENT_TYPES.includes(opts.employmentType as EmploymentType)
    ) {
      userError(`invalid employment type: ${opts.employmentType}`);
      process.exit(1);
    }

    try {
      if (inferredCampaign === null) {
        const { campaigns } = await runListCampaigns();

        if (opts.json) {
          userOutput(JSON.stringify(campaigns, null, 2));
          return;
        }

        if (campaigns.length === 0) {
          userOutput('No campaigns found.');
          return;
        }

        const maxNameLen = Math.max(...campaigns.map((c) => c.name.length));
        userOutput(`${bold('Campaigns:')}`);
        for (const c of campaigns) {
          const apps = `${c.applicationCount} ${c.applicationCount === 1 ? 'application' : 'applications'}`;
          userOutput(`  ${cyan(c.name.padEnd(maxNameLen))}  ${apps}`);
        }
      } else {
        const { entries } = await runListApplications(inferredCampaign, {
          status: opts.status as string | undefined,
          tags: opts.tags as string[] | undefined,
          targetRole: opts.role as string | undefined,
          employmentType: opts.employmentType as EmploymentType | undefined,
          filter: opts.filter as string | undefined,
        });

        if (opts.json) {
          userOutput(JSON.stringify(entries, null, 2));
          return;
        }

        if (entries.length === 0) {
          userOutput('No applications found.');
          return;
        }

        // Reverse so the most recent applications appear at the bottom
        // near the cursor, saving the user from scrolling up.
        entries.reverse();

        for (let i = 0; i < entries.length; i++) {
          const e = entries[i]!;
          const statusCell = statusColor(e.status ?? 'applied');
          const role = e.targetRole && e.targetRole !== 'unknown' ? dim(` → ${e.targetRole}`) : '';
          userOutput(
            `${statusCell}  ${bold(e.slug.padEnd(STATUS_COL_WIDTH))}  ${e.title}${role}  ${e.company}  ${dim(e.appliedOn)}`,
          );
        }
      }
    } catch (err) {
      logError(log, err);
      if (err instanceof ListError) {
        userError(err.message);
      } else {
        throw err;
      }
    }
  });
