import { Command } from 'commander';
import { collectTags, type GlobalOpts } from '../options.js';
import {
  runListCampaigns,
  runListApplications,
  ListError,
  InvalidListStatusError,
} from '../../core/list/index.js';
import { APPLICATION_STATUSES } from '../../core/applications/types.js';
import { getRootLogger, logError } from '../../core/logger/logger.js';
import { userOutput, userError } from '../output.js';
import { bold, cyan, dim, statusColor } from '../colors.js';

/**
 * `jho list` — list campaigns (no arg) or applications (with --campaign).
 */
export const listCommand = new Command('list')
  .description('List campaigns, or applications within a campaign')
  .option('--status <status>', 'filter by status (requires --campaign)')
  .option('--tag <tag>', 'filter by tag, repeatable (requires --campaign)', collectTags, [])
  .option('--role <role>', 'filter by target role (requires --campaign)')
  .option('--json', 'output as JSON')
  .action(async function (opts) {
    const globals = this.parent?.opts() as GlobalOpts | undefined;
    const explicitCampaign = globals?.campaign;
    const log = getRootLogger().child({ cmd: 'list', campaign: explicitCampaign ?? '(campaigns)' });

    try {
      if (explicitCampaign === undefined) {
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
        const { entries } = await runListApplications(explicitCampaign, {
          status: opts.status as string | undefined,
          tags: opts.tag as string[] | undefined,
          targetRole: opts.role as string | undefined,
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
          const e = entries[i]!;
          userOutput(`${cyan(e.slug)}`);
          userOutput(`  ${dim('Title:')} ${e.title ?? ''}`);
          userOutput(`  ${dim('Company:')} ${e.company ?? ''}`);
          userOutput(`  ${dim('Location:')} ${e.location ?? ''}`);
          userOutput(`  ${dim('Status:')} ${statusColor(e.status ?? '')}`);
          userOutput(`  ${dim('Applied on:')} ${e.appliedOn ?? ''}`);
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
Without --campaign, lists all campaigns. Add --campaign <name> to list applications
within that campaign.

Examples:
  $ jho list                                    # list campaigns
  $ jho list --json                             # list campaigns as JSON
  $ jho list --campaign default                 # list all applications
  $ jho list --campaign default --status interview  # filter by status
  $ jho list --campaign default --tag remote        # filter by tag
  $ jho list --campaign default --json              # applications as JSON
`,
);
