import { Command } from 'commander';
import Table from 'cli-table3';
import { resolveCampaignName, resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { resolveSlug, SlugMissingError } from '../slug.js';
import {
  addInterview,
  listInterviews,
  markInterviewStatus,
  appendInterviewNotes,
  InterviewError,
  InterviewNotFoundError,
  INTERVIEW_TYPES,
  INTERVIEW_STATUSES,
} from '../../core/interviews/index.js';
import type { InterviewEntry } from '../../core/interviews/index.js';
import { getRootLogger, logError } from '../../core/logger/logger.js';
import { userError, userOutput, userSuccess } from '../output.js';
import { withSpinner } from '../../core/spinner.js';
import type { GlobalOpts } from '../options.js';

/**
 * `jho interview add [<slug>]` — add an interview entry.
 */
const addCmd = new Command('add')
  .description('Add an interview entry (slug inferred from cwd if omitted)')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .requiredOption('--when <datetime>', 'interview date/time (e.g. "2026-06-15 10:00")')
  .option('--type <type>', `interview type (${INTERVIEW_TYPES.join(', ')})`, 'technical')
  .requiredOption('--duration <minutes>', 'duration in minutes', '60')
  .option('--interviewer <name>', 'interviewer name')
  .option('--location <location>', 'interview location or link')
  .option('--title <title>', 'interview title')
  .action(async function (slug: string | undefined, opts) {
    const globals = this.parent?.parent?.opts() as GlobalOpts | undefined;
    const campaign = resolveCampaignName(globals?.campaign);
    const log = getRootLogger().child({ cmd: 'interview.add', campaign });

    try {
      const resolvedSlug = resolveSlug(slug, campaign);
      const appliedDir = resolveAppliedDir(resolveCampaignRoot(campaign));

      const result = await withSpinner(
        'Adding interview...',
        'Interview added',
        () =>
          addInterview(appliedDir, resolvedSlug, {
            when: opts.when,
            type: opts.type,
            duration: parseInt(opts.duration as string, 10),
            interviewers: opts.interviewer as string | undefined,
            location: opts.location as string | undefined,
            title: opts.title as string | undefined,
          }),
        'Failed to add interview',
      );

      userSuccess(`Interview #${result.index} added`);
      log.info({ slug: resolvedSlug, index: result.index }, 'interview.add.completed');
    } catch (err) {
      if (err instanceof SlugMissingError) {
        logError(log, err, 'interview.add.slug-missing', { campaign });
        log.flush();
        userError(
          `${err.message}\nhint: pass a slug, or run from inside the application folder (e.g. cd applied/<slug>)`,
        );
        process.exit(1);
      }
      if (err instanceof InterviewNotFoundError) {
        logError(log, err, 'interview.add.not-found', { campaign });
        log.flush();
        userError(`${err.message}\nhint: create the application first with: jho track <url>`);
        process.exit(1);
      }
      if (err instanceof InterviewError) {
        logError(log, err, 'interview.add.failed', { campaign });
        log.flush();
        userError(err.message);
        process.exit(1);
      }
      throw err;
    }
  });

addCmd.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory.

Examples:
  $ jho interview add --when "2026-06-15 10:00" --type technical --duration 60
  $ jho interview add --when "2026-06-15 14:00" --interviewer "A. Smith" --location "Google Meet"
  $ jho interview add my-app --when "2026-06-15 10:00"
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho interview add --when "2026-06-15 10:00"
`,
);

/**
 * Format interview entries as a table.
 */
function formatInterviewTable(entries: InterviewEntry[]): string {
  if (entries.length === 0) {
    return 'No interviews found.';
  }

  const table = new Table({
    head: ['#', 'Type', 'When', 'Duration', 'Status', 'Location'],
    style: { head: [] },
  });

  for (const entry of entries) {
    table.push([
      entry.index,
      entry.type,
      entry.when,
      `${entry.duration} min`,
      entry.status,
      entry.location || '-',
    ]);
  }

  return table.toString();
}

/**
 * `jho interview list [<slug>]` — list interviews for an application.
 */
const listCmd = new Command('list')
  .description('List interviews for an application (slug inferred from cwd if omitted)')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .action(async function (slug: string | undefined) {
    const globals = this.parent?.parent?.opts() as GlobalOpts | undefined;
    const campaign = resolveCampaignName(globals?.campaign);
    const log = getRootLogger().child({ cmd: 'interview.list', campaign });

    try {
      const resolvedSlug = resolveSlug(slug, campaign);
      const appliedDir = resolveAppliedDir(resolveCampaignRoot(campaign));
      const entries = await listInterviews(appliedDir, resolvedSlug);
      userOutput(formatInterviewTable(entries));
      log.info({ slug: resolvedSlug, count: entries.length }, 'interview.list.completed');
    } catch (err) {
      if (err instanceof SlugMissingError) {
        logError(log, err, 'interview.list.slug-missing', { campaign });
        log.flush();
        userError(
          `${err.message}\nhint: pass a slug, or run from inside the application folder (e.g. cd applied/<slug>)`,
        );
        process.exit(1);
      }
      if (err instanceof InterviewError) {
        logError(log, err, 'interview.list.failed', { campaign });
        log.flush();
        userError(err.message);
        process.exit(1);
      }
      throw err;
    }
  });

listCmd.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory.

Examples:
  $ jho interview list
  $ jho interview list 2026-Jan-15-frontend-acme-12345
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho interview list
`,
);

/**
 * `jho interview mark <n> --status <status>` — mark interview status.
 * Slug is optional; inferred from cwd when omitted.
 */
const markCmd = new Command('mark')
  .description('Mark the current interview status')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .argument('<n>', 'interview number (from list)')
  .requiredOption('--status <status>', `new status (${INTERVIEW_STATUSES.join(', ')})`)
  .action(async function (slug: string | undefined, n: string, opts) {
    const globals = this.parent?.parent?.opts() as GlobalOpts | undefined;
    const campaign = resolveCampaignName(globals?.campaign);
    const log = getRootLogger().child({ cmd: 'interview.mark', campaign });

    try {
      const resolvedSlug = resolveSlug(slug, campaign);
      const appliedDir = resolveAppliedDir(resolveCampaignRoot(campaign));
      const sectionNumber = parseInt(n, 10);

      if (Number.isNaN(sectionNumber) || sectionNumber < 1) {
        userError('interview number must be a positive integer');
        process.exit(1);
      }

      await withSpinner(
        'Marking interview...',
        'Interview marked',
        () =>
          markInterviewStatus(appliedDir, resolvedSlug, {
            sectionNumber,
            status: opts.status,
          }),
        'Failed to mark interview',
      );

      userSuccess(`Interview #${sectionNumber} marked as ${opts.status}`);
      log.info(
        { slug: resolvedSlug, sectionNumber, status: opts.status },
        'interview.mark.completed',
      );
    } catch (err) {
      if (err instanceof SlugMissingError) {
        logError(log, err, 'interview.mark.slug-missing', { campaign });
        log.flush();
        userError(
          `${err.message}\nhint: pass a slug, or run from inside the application folder (e.g. cd applied/<slug>)`,
        );
        process.exit(1);
      }
      if (err instanceof InterviewError) {
        logError(log, err, 'interview.mark.failed', { campaign });
        log.flush();
        userError(err.message);
        process.exit(1);
      }
      throw err;
    }
  });

markCmd.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory.

Examples:
  $ jho interview mark 1 --status passed
  $ jho interview mark 2 --status failed
  $ jho interview mark 1 --status rescheduled
  $ jho interview mark my-app 1 --status passed  # explicit slug
`,
);

/**
 * `jho interview notes <n> --append <text>` — add notes to an interview.
 * Slug is optional; inferred from cwd when omitted.
 */
const notesCmd = new Command('notes')
  .description('Add notes to an interview entry')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .argument('<n>', 'interview number (from list)')
  .requiredOption('--append <text>', 'notes to append')
  .action(async function (slug: string | undefined, n: string, opts) {
    const globals = this.parent?.parent?.opts() as GlobalOpts | undefined;
    const campaign = resolveCampaignName(globals?.campaign);
    const log = getRootLogger().child({ cmd: 'interview.notes', campaign });

    try {
      const resolvedSlug = resolveSlug(slug, campaign);
      const appliedDir = resolveAppliedDir(resolveCampaignRoot(campaign));
      const sectionNumber = parseInt(n, 10);

      if (Number.isNaN(sectionNumber) || sectionNumber < 1) {
        userError('interview number must be a positive integer');
        process.exit(1);
      }

      await withSpinner(
        'Appending notes...',
        'Notes appended',
        () =>
          appendInterviewNotes(appliedDir, resolvedSlug, {
            sectionNumber,
            notes: opts.append,
          }),
        'Failed to append notes',
      );

      userSuccess(`Notes appended to interview #${sectionNumber}`);
      log.info({ slug: resolvedSlug, sectionNumber }, 'interview.notes.completed');
    } catch (err) {
      if (err instanceof SlugMissingError) {
        logError(log, err, 'interview.notes.slug-missing', { campaign });
        log.flush();
        userError(
          `${err.message}\nhint: pass a slug, or run from inside the application folder (e.g. cd applied/<slug>)`,
        );
        process.exit(1);
      }
      if (err instanceof InterviewError) {
        logError(log, err, 'interview.notes.failed', { campaign });
        log.flush();
        userError(err.message);
        process.exit(1);
      }
      throw err;
    }
  });

notesCmd.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory.

Examples:
  $ jho interview notes 1 --append "They asked about distributed systems"
  $ jho interview notes 2 --append "Need to review system design"
  $ jho interview notes my-app 1 --append "They asked about distributed systems"  # explicit slug
`,
);

/**
 * `jho interview [<slug>] <subcommand>` — manage the interview pipeline.
 * Slug is optional; inferred from cwd when omitted.
 */
export const interviewCommand = new Command('interview')
  .description('Manage the interview pipeline (slug inferred from cwd if omitted)')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .addCommand(addCmd)
  .addCommand(listCmd)
  .addCommand(markCmd)
  .addCommand(notesCmd);

interviewCommand.addHelpText(
  'after',
  `
The slug is optional on all subcommands. When omitted, it is inferred from
the current directory — run from inside an application folder to skip it.

Subcommands:
  add       Add an interview entry
  list      List interviews for an application
  mark      Mark the current interview status
  notes     Add notes to an interview entry

Examples:
  $ jho interview add --when "2026-06-15 10:00" --type technical --duration 60
  $ jho interview add --when "2026-06-15 14:00" --interviewer "A. Smith" --location "Google Meet"
  $ jho interview list
  $ jho interview mark 1 --status passed
  $ jho interview mark 2 --status failed
  $ jho interview notes 1 --append "They asked about distributed systems"
  $ jho interview add my-app --when "2026-06-15 10:00"  # explicit slug
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho interview add --when "2026-06-15 10:00"
`,
);
