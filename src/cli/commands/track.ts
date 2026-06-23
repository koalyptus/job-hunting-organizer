import { Command } from 'commander';
import { join } from 'node:path';
import { log as clackLog } from '@clack/prompts';
import { collectTags, type GlobalOpts } from '../options.js';
import { readClipboard } from '../clipboard.js';
import { readStdin } from '../stdin.js';
import { resolveCampaignName, resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { isUrl } from '../../core/url.js';
import { resolveSlug, SlugMissingError } from '../slug.js';
import {
  runTrack,
  prepareTrack,
  confirmAndCreate,
  validateTrackStatus,
  hasTrackUpdateFlags,
  TrackError,
  TrackCancelled,
} from '../../core/track/index.js';
import { UserInputError } from '../errors.js';
import { withSpinner } from '../../core/spinner.js';
import { APPLICATION_STATUSES } from '../../core/applications/types.js';

/**
 * `jho track <url>` — record a new application (or update by slug).
 */
export const trackCommand = new Command('track')
  .description('Record a new application (or update by slug)')
  .argument('[urlOrSlug]', 'job posting URL or existing application slug')
  .option('--paste', 'paste job description from clipboard')
  .option('--stdin', 'read job description from stdin')
  .option('--status <status>', `initial status (one of: ${APPLICATION_STATUSES.join(', ')})`)
  .option('--salary <range>', 'salary or pay range')
  .option('--tag <tag>', 'add a tag (repeatable)', collectTags, [])
  .option('--note <text>', 'add a note')
  .option('--target-role <role>', 'target role for the application')
  .option('-y, --yes', 'skip confirmation prompts')
  .action(async function (urlOrSlug: string | undefined, opts) {
    const globals = this.parent?.opts() as GlobalOpts | undefined;
    const campaign = resolveCampaignName(globals?.campaign);
    let text: string | undefined;

    if (opts.paste === true) {
      text = await readClipboard();
    } else if (opts.stdin === true) {
      text = await readStdin();
    }

    const isCreate = text !== undefined || isUrl(urlOrSlug);

    try {
      const status = validateTrackStatus(opts.status as string | undefined);

      if (isCreate) {
        // Create mode: extract JD with spinner, then confirm and create
        const summary = await withSpinner(
          'Extracting job description...',
          'Job description extracted',
          () =>
            prepareTrack({
              campaign,
              url: urlOrSlug,
              text,
            }),
          'Failed',
        );

        const resultSlug = await confirmAndCreate({
          campaign,
          summary,
          url: urlOrSlug,
          status,
          salary: opts.salary as string | undefined,
          tags: (opts.tag as string[] | undefined) ?? [],
          note: opts.note as string | undefined,
          targetRole: opts.targetRole as string | undefined,
          yes: opts.yes as boolean | undefined,
        });

        const campaignRoot = resolveCampaignRoot(campaign);
        const appliedDir = resolveAppliedDir(campaignRoot);
        const appPath = join(appliedDir, resultSlug);
        clackLog.info(`
Created application: ${appPath}

Next steps:
  cd ${appPath}
  jho show ${resultSlug}          # view application details
  jho cover-letter ${resultSlug}  # generate a tailored cover letter
  jho prepare ${resultSlug}       # prep for an interview
`);
      } else {
        // Update mode: resolve slug and run update
        const slug = resolveSlug(urlOrSlug, campaign);

        // Early check: if no patch fields were provided, skip the
        // spinner and prompt entirely and just report "no changes".
        if (!hasTrackUpdateFlags(opts)) {
          clackLog.info(`No changes to apply for ${slug}.`);
          return;
        }

        const result = await withSpinner(
          'Updating application...',
          'Application updated',
          () =>
            runTrack({
              campaign,
              slug,
              status,
              salary: opts.salary as string | undefined,
              tags: (opts.tag as string[] | undefined) ?? [],
              note: opts.note as string | undefined,
              targetRole: opts.targetRole as string | undefined,
              yes: opts.yes as boolean | undefined,
            }),
          'Failed',
        );

        const campaignRoot = resolveCampaignRoot(campaign);
        const appliedDir = resolveAppliedDir(campaignRoot);
        const appPath = join(appliedDir, result.slug);

        if (!result.changed) {
          clackLog.info(`No changes to apply for ${result.slug}.`);
        } else {
          clackLog.info(`
Updated application: ${appPath}

Next steps:
  jho show ${result.slug}          # view application details
  jho list                        # list all applications
`);
        }
      }
    } catch (err) {
      if (err instanceof TrackCancelled) {
        clackLog.info('Tracking cancelled.');
        process.exit(0);
      }
      if (err instanceof TrackError) {
        process.stderr.write(`error: ${err.message}\n`);
        process.exit(1);
      }
      if (err instanceof SlugMissingError) {
        process.stderr.write(`error: ${err.message}\n`);
        process.exit(1);
      }
      if (err instanceof UserInputError) {
        process.stderr.write(`error: ${err.message}\n`);
        process.exit(1);
      }
      throw err;
    }
  });

trackCommand.addHelpText(
  'after',
  `
Track a new application from a URL, or update an existing one by slug.
Use --paste or --stdin to provide the job description without a URL.

Tracking creates a folder in your campaign's applied/ directory with:
  - meta.md: application metadata (title, company, status, tags, etc.)
  - jd.md: the fetched job description and your notes

Examples:
  $ jho track https://example.com/job/123
  $ jho track https://example.com/job/123 --salary "80k-100k"
  $ jho track https://example.com/job/123 --tag urgent --tag remote
  $ jho track https://example.com/job/123 --note "Referred by Alice"
  $ jho track https://example.com/job/123 --target-role "frontend-dev"
  $ jho track --paste                                      # paste JD from clipboard
  $ jho track --stdin < job.txt                            # read JD from stdin
  $ jho track 2026-Jan-15-frontend-acme-12345 --status interview  # update existing
  $ jho --campaign freelance track https://example.com/job/123   # specific campaign
`,
);
