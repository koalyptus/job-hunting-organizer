import { Command } from 'commander';
import { collectTags, type GlobalOpts } from '../options.js';
import {
  runListCampaigns,
  runListApplications,
  ListError,
  InvalidListStatusError,
} from '../../core/list/index.js';
import { findCampaignFromCwd, resolveDataRoot } from '../../core/paths.js';
import { APPLICATION_STATUSES, EMPLOYMENT_TYPES } from '../../core/applications/types.js';
import type { EmploymentType } from '../../core/applications/types.js';
import { getRootLogger, logError } from '../../core/logger/logger.js';
import { userOutput, userError } from '../output.js';
import { bold, cyan, dim, statusColor } from '../colors.js';

/**
 * `jho list` — list campaigns (no arg) or applications (with --campaign).
 */
export const listCommand = new Command('list')
  .description('List campaigns, or applications within a campaign')
  .option('--status <status>', 'filter by status (requires --campaign or campaign folder)')
  .option(
    '--tag <tag>',
    'filter by tag, repeatable (requires --campaign or campaign folder)',
    collectTags,
    [],
  )
  .option('--role <role>', 'filter by target role (requires --campaign or campaign folder)')
  .option(
    '--employment-type <type>',
    'filter by employment type (permanent|temp|contract|casual|part-time)',
  )
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
          tags: opts.tag as string[] | undefined,
          targetRole: opts.role as string | undefined,
          employmentType: opts.employmentType as EmploymentType | undefined,
        });

        if (opts.json) {
          userOutput(JSON.stringify(entries, null, 2));
          return;
        }

        if (entries.length === 0) {
          userOutput('No applications found.');
          return;
        }

        for (let i = 0; i < entries.length; i++) {
          if (i > 0) {
            userOutput('');
          }
          const entry = entries[i]!;
          userOutput(`${cyan(entry.slug)}`);
          userOutput(`  ${dim('Title:')} ${entry.title ?? ''}`);
          userOutput(`  ${dim('Company:')} ${entry.company ?? ''}`);
          userOutput(`  ${dim('Location:')} ${entry.location ?? ''}`);
          userOutput(`  ${dim('Status:')} ${statusColor(entry.status ?? '')}`);
          if (entry.employmentType) {
            userOutput(`  ${dim('Type:')} ${entry.employmentType}`);
          }
          userOutput(`  ${dim('Applied on:')} ${entry.appliedOn ?? ''}`);
        }
        const apps = entries.length === 1 ? 'application' : 'applications';
        userOutput(`${entries.length} ${apps}`);
      }
    } catch (err) {
      if (err instanceof InvalidListStatusError) {
        logError(log, err, 'list.invalid-status');
        log.flush();
        userError(`${err.message}\nhint: use one of: ${APPLICATION_STATUSES.join(', ')}`);
        process.exit(1);
      }
      if (err instanceof ListError) {
        logError(log, err, 'list.failed');
        log.flush();
        userError(err.message);
        process.exit(1);
      }
      throw err;
    }
  });

listCommand.addHelpText(
  'after',
  `
Without --campaign, lists all campaigns. When run from inside a campaign
folder, lists applications within that campaign. Add --campaign <name>
to target a specific campaign explicitly.

Examples:
  $ jho list                                    # list campaigns (outside campaign folder)
  $ jho list --json                             # list campaigns as JSON
  $ cd campaigns/default && jho list            # list applications (cwd inference)
  $ jho list --campaign default                 # list all applications
  $ jho list --campaign default --status interview  # filter by status
  $ jho list --campaign default --tag remote        # filter by tag
  $ jho list --campaign default --json              # applications as JSON
`,
);
