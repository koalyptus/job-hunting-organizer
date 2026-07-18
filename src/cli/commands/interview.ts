import { Command } from 'commander';
import { join } from 'node:path';
import { text, select, isCancel, log as clackLog } from '@clack/prompts';
import Table from 'cli-table3';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { resolveSlug, SlugMissingError } from '../slug.js';
import { validateDatetime } from '../validate.js';
import { resolveCampaign } from '../campaign.js';
import { dim, cyan, interviewStatusColor, interviewTypeColor } from '../colors.js';
import { generateIcsFile } from '../interview-ics.js';
import type { InterviewDetails } from '../interview-ics.js';
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
import type { InterviewEntry, InterviewType } from '../../core/interviews/index.js';
import type { Logger } from 'pino';
import { getRootLogger, logError } from '../../core/logger/logger.js';
import { userError, userOutput, userSuccess } from '../output.js';
import { withSpinner } from '../../core/spinner.js';
import type { GlobalOpts } from '../options.js';

/**
 * Prompt the user for interview details using @clack/prompts.
 * Returns the interview options, or exits if cancelled.
 */
async function promptInterviewDetails(): Promise<{
  when: string;
  type: string;
  duration: number;
  interviewer?: string;
  location?: string;
  title?: string;
}> {
  const whenResult = await text({
    message: 'When is the interview?',
    placeholder: 'e.g. 2026-06-15 10:00',
  });

  if (isCancel(whenResult)) {
    clackLog.info('Cancelled.');
    process.exit(0);
  }

  const when = whenResult as string;
  if (!when) {
    userError('Interview date/time is required');
    process.exit(1);
  }

  const whenError = validateDatetime(when);
  if (whenError) {
    userError(`Invalid date/time: ${whenError}`);
    process.exit(1);
  }

  const typeResult = await select({
    message: 'Interview type?',
    options: INTERVIEW_TYPES.map((t) => ({ value: t, label: t })),
    initialValue: 'technical',
  });

  if (isCancel(typeResult)) {
    clackLog.info('Cancelled.');
    process.exit(0);
  }

  const type = typeResult as string;

  const durationResult = await text({
    message: 'Duration in minutes?',
    placeholder: '60',
    initialValue: '60',
  });

  if (isCancel(durationResult)) {
    clackLog.info('Cancelled.');
    process.exit(0);
  }

  const duration = parseInt((durationResult as string) || '60', 10);
  if (Number.isNaN(duration) || duration <= 0) {
    userError('Duration must be a positive number');
    process.exit(1);
  }

  const interviewerResult = await text({
    message: 'Interviewer name? (optional)',
    placeholder: 'Press Enter to skip',
  });

  if (isCancel(interviewerResult)) {
    clackLog.info('Cancelled.');
    process.exit(0);
  }

  const locationResult = await text({
    message: 'Location or link? (optional)',
    placeholder: 'Press Enter to skip',
  });

  if (isCancel(locationResult)) {
    clackLog.info('Cancelled.');
    process.exit(0);
  }

  const titleResult = await text({
    message: 'Title? (optional)',
    placeholder: 'Press Enter to skip',
  });

  if (isCancel(titleResult)) {
    clackLog.info('Cancelled.');
    process.exit(0);
  }

  return {
    when,
    type,
    duration,
    interviewer: (interviewerResult as string) || undefined,
    location: (locationResult as string) || undefined,
    title: (titleResult as string) || undefined,
  };
}

/**
 * Handle known interview errors, logging and exiting with a user message.
 * Re-throws unknown errors for the caller to handle.
 */
function handleInterviewError(err: unknown, log: Logger, campaign: string): never {
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

/**
 * Format a recap table for the interview.
 */
function formatRecapTable(
  index: number,
  when: string,
  type: string,
  duration: number,
  interviewer?: string,
  location?: string,
  title?: string,
): string {
  const table = new Table({
    style: { head: [] },
  });

  table.push([dim('#'), cyan(String(index))]);
  table.push([dim('When'), when]);
  table.push([dim('Type'), interviewTypeColor(type)]);
  table.push([dim('Duration'), `${duration} min`]);
  if (title) {
    table.push([dim('Title'), title]);
  }
  if (interviewer) {
    table.push([dim('Interviewer'), interviewer]);
  }
  if (location) {
    table.push([dim('Location'), location]);
  }

  return table.toString();
}

/**
 * Shared flow for adding an interview: calls the core, generates ICS, shows recap + next steps.
 * Used by both `addCmd` and the parent `interviewCommand` alias.
 */
async function addInterviewFlow(
  log: Logger,
  appliedDir: string,
  resolvedSlug: string,
  details: InterviewDetails,
): Promise<void> {
  const result = await withSpinner(
    'Adding interview...',
    'Interview added',
    () =>
      addInterview(appliedDir, resolvedSlug, {
        when: details.when,
        type: details.type as InterviewType,
        duration: details.duration,
        interviewers: details.interviewer,
        location: details.location,
        title: details.title,
      }),
    'Failed to add interview',
  );

  const appFolder = join(appliedDir, resolvedSlug);

  let icsPath: string | undefined;
  try {
    icsPath = await generateIcsFile(
      appFolder,
      result.index,
      details.when,
      details.type,
      details.duration,
      details.title,
      details.location,
    );
  } catch (err) {
    log.warn({ err, slug: resolvedSlug }, 'interview.ics.generation-failed');
  }

  userOutput(
    '\n' +
      formatRecapTable(
        result.index,
        details.when,
        details.type,
        details.duration,
        details.interviewer,
        details.location,
        details.title,
      ),
  );

  userOutput(`Interview saved to: ${join(appFolder, 'interviews.md')}
${icsPath ? `ICS file: ${icsPath}` : 'ICS file: (generation failed — interview was still saved)'}

Next steps:
  jho interview list ${resolvedSlug}          # view all interviews
  jho interview mark ${resolvedSlug} ${result.index} --status completed  # mark status
  jho interview notes ${resolvedSlug} ${result.index} --append "..."    # add notes
  jho prepare ${resolvedSlug}                 # prep for the interview
`);

  log.info({ slug: resolvedSlug, index: result.index }, 'interview.add.completed');
}

/**
 * `jho interview add [<slug>]` — add an interview entry.
 */
const addCmd = new Command('add')
  .description('Add an interview entry (slug inferred from cwd if omitted)')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .option('--when <datetime>', 'interview date/time (e.g. "2026-06-15 10:00")')
  .option('--type <type>', `interview type (${INTERVIEW_TYPES.join(', ')})`, 'technical')
  .option('--duration <minutes>', 'duration in minutes', '60')
  .option('--interviewer <name>', 'interviewer name')
  .option('--location <location>', 'interview location or link')
  .option('--title <title>', 'interview title')
  .action(async function (slug: string | undefined, opts) {
    const globals = this.parent?.parent?.opts() as GlobalOpts | undefined;
    const campaign = await resolveCampaign(globals);
    const log = getRootLogger().child({ cmd: 'interview.add', campaign });

    try {
      const resolvedSlug = resolveSlug(slug, campaign);
      const appliedDir = resolveAppliedDir(resolveCampaignRoot(campaign));

      let when = opts.when as string | undefined;
      let type = opts.type as string;
      let duration = parseInt(opts.duration as string, 10);
      let interviewer = opts.interviewer as string | undefined;
      let location = opts.location as string | undefined;
      let title = opts.title as string | undefined;

      if (when) {
        const whenError = validateDatetime(when);
        if (whenError) {
          userError(`Invalid date/time: ${whenError}`);
          process.exit(1);
        }
      }

      if (!when) {
        const details = await promptInterviewDetails();
        when = details.when;
        type = details.type;
        duration = details.duration;
        interviewer = details.interviewer;
        location = details.location;
        title = details.title;
      }

      await addInterviewFlow(log, appliedDir, resolvedSlug, {
        when,
        type,
        duration,
        interviewer,
        location,
        title,
      });
    } catch (err) {
      handleInterviewError(err, log, campaign);
    }
  });

addCmd.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory.

When run without --when, enters interactive wizard mode to prompt for details.

Examples:
  $ jho interview add                                          # wizard mode
  $ jho interview add --when "2026-06-15 10:00"               # explicit flags
  $ jho interview add --when "2026-06-15 10:00" --type technical --duration 60
  $ jho interview add my-app --when "2026-06-15 10:00"        # explicit slug
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho interview add  # infer slug
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
    head: [
      dim('#'),
      dim('Type'),
      dim('When'),
      dim('Duration'),
      dim('Interviewer'),
      dim('Status'),
      dim('Location'),
    ],
    colWidths: [3, 12, 16, 9, 14, 11, 40],
    style: { head: [] },
    wordWrap: true,
  });

  for (const entry of entries) {
    table.push([
      cyan(String(entry.index)),
      interviewTypeColor(entry.type),
      entry.when,
      `${entry.duration} min`,
      entry.interviewers || dim('-'),
      interviewStatusColor(entry.status),
      entry.location || dim('-'),
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
    const campaign = await resolveCampaign(globals);
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
  .argument('[n]', 'interview number (from list)')
  .requiredOption('--status <status>', `new status (${INTERVIEW_STATUSES.join(', ')})`)
  .action(async function (slug: string | undefined, n: string | undefined, opts) {
    const globals = this.parent?.parent?.opts() as GlobalOpts | undefined;
    const campaign = await resolveCampaign(globals);
    const log = getRootLogger().child({ cmd: 'interview.mark', campaign });

    try {
      // When only one positional arg is provided, it could be slug or number.
      // If it looks like a positive integer, treat it as the number.
      if (n === undefined && slug !== undefined && /^\d+$/.test(slug)) {
        n = slug;
        slug = undefined;
      }

      if (n === undefined) {
        userError('interview number is required (the index from interview list)');
        process.exit(1);
      }

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
  .argument('[n]', 'interview number (from list)')
  .requiredOption('--append <text>', 'notes to append')
  .action(async function (slug: string | undefined, n: string | undefined, opts) {
    const globals = this.parent?.parent?.opts() as GlobalOpts | undefined;
    const campaign = await resolveCampaign(globals);
    const log = getRootLogger().child({ cmd: 'interview.notes', campaign });

    try {
      // When only one positional arg is provided, it could be slug or number.
      // If it looks like a positive integer, treat it as the number.
      if (n === undefined && slug !== undefined && /^\d+$/.test(slug)) {
        n = slug;
        slug = undefined;
      }

      if (n === undefined) {
        userError('interview number is required (the index from interview list)');
        process.exit(1);
      }

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

      const appFolder = join(resolveAppliedDir(resolveCampaignRoot(campaign)), resolvedSlug);
      userOutput(`Notes saved to: ${join(appFolder, 'interviews.md')}

Next steps:
  jho interview list ${resolvedSlug}                          # view all interviews
  jho interview mark ${resolvedSlug} ${sectionNumber} --status completed  # mark status
  jho prepare ${resolvedSlug}                                 # prep for the interview
  jho retro ${resolvedSlug}                                   # post-mortem after the interview
`);

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
 * `jho interview [<slug>]` — manage the interview pipeline.
 * Slug is optional; inferred from cwd when omitted.
 * Without a subcommand, this is an alias for `interview add`.
 */
export const interviewCommand = new Command('interview')
  .description('Manage the interview pipeline (slug inferred from cwd if omitted)')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .addCommand(addCmd)
  .addCommand(listCmd)
  .addCommand(markCmd)
  .addCommand(notesCmd)
  .action(async function (slug: string | undefined) {
    // No subcommand provided — alias for add
    const globals = this.parent?.opts() as GlobalOpts | undefined;
    const campaign = await resolveCampaign(globals);
    const log = getRootLogger().child({ cmd: 'interview', campaign });

    try {
      const resolvedSlug = resolveSlug(slug, campaign);
      const appliedDir = resolveAppliedDir(resolveCampaignRoot(campaign));

      const details = await promptInterviewDetails();

      await addInterviewFlow(log, appliedDir, resolvedSlug, {
        when: details.when,
        type: details.type,
        duration: details.duration,
        interviewer: details.interviewer,
        location: details.location,
        title: details.title,
      });
    } catch (err) {
      handleInterviewError(err, log, campaign);
    }
  });

interviewCommand.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory
— run from inside an application folder (e.g. cd applied/<slug>) to skip it.

Without a subcommand, this is an alias for \`add\`.

Subcommands:
  add       Add an interview entry (interactive wizard or explicit flags)
  list      List interviews for an application
  mark      Mark the current interview status
  notes     Add notes to an interview entry

Examples:
  $ jho interview                                          # wizard mode (infer slug from cwd)
  $ jho interview my-app                                   # wizard mode (explicit slug)
  $ jho interview my-app --when "2026-06-15 10:00"         # non-interactive add
  $ jho interview add                                      # explicit add subcommand
  $ jho interview list my-app                              # list interviews
  $ jho interview mark my-app 1 --status passed            # mark status
  $ jho interview notes my-app 1 --append "They asked about distributed systems"
`,
);
