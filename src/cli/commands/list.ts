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
import { userSuccess, userError } from '../output.js';
import { bold, cyan, dim, green, red, yellow } from '../colors.js';

function statusColor(s: string): string {
  switch (s) {
    case 'interview':
      return yellow(s);
    case 'offer':
    case 'accepted':
      return green(s);
    case 'rejected':
      return red(s);
    case 'withdrawn':
    case 'abandoned':
    case 'ghosted':
      return dim(s);
    default:
      return s;
  }
}

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
          userSuccess(JSON.stringify(campaigns, null, 2));
          return;
        }

        if (campaigns.length === 0) {
          userSuccess('No campaigns found.');
          return;
        }

        const maxNameLen = Math.max(...campaigns.map((c) => c.name.length));
        process.stdout.write(`${bold('Campaigns:')}\n`);
        for (const c of campaigns) {
          const apps = `${c.applicationCount} ${c.applicationCount === 1 ? 'application' : 'applications'}`;
          process.stdout.write(`  ${cyan(c.name.padEnd(maxNameLen))}  ${apps}\n`);
        }
      } else {
        const { entries } = await runListApplications(explicitCampaign, {
          status: opts.status as string | undefined,
          tags: opts.tag as string[] | undefined,
          targetRole: opts.role as string | undefined,
        });

        if (opts.json) {
          userSuccess(JSON.stringify(entries, null, 2));
          return;
        }

        if (entries.length === 0) {
          userSuccess('No applications found.');
          return;
        }

        for (let i = 0; i < entries.length; i++) {
          if (i > 0) {
            process.stdout.write('\n');
          }
          const e = entries[i]!;
          process.stdout.write(`${cyan(e.slug)}\n`);
          process.stdout.write(`  ${dim('Title:')} ${e.title ?? ''}\n`);
          process.stdout.write(`  ${dim('Company:')} ${e.company ?? ''}\n`);
          process.stdout.write(`  ${dim('Location:')} ${e.location ?? ''}\n`);
          process.stdout.write(`  ${dim('Status:')} ${statusColor(e.status ?? '')}\n`);
          process.stdout.write(`  ${dim('Applied on:')} ${e.appliedOn ?? ''}\n`);
        }
        const apps = entries.length === 1 ? 'application' : 'applications';
        process.stdout.write(`${entries.length} ${apps}\n`);
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
