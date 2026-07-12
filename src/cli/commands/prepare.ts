import { Command } from 'commander';
import { join } from 'node:path';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { resolveSlug, SlugMissingError } from '../slug.js';
import { isUrl } from '../../core/url.js';
import { extractJdFromUrl } from '../../core/jobs/extract.js';
import { defaultLlmConfig } from '../../core/llm.js';
import { getConfig } from '../../core/config/config.js';
import {
  generatePrep,
  generatePrepFromText,
  readPrep,
  appendTopic,
  PrepError,
  PrepNotFoundError,
  PrepReadError,
} from '../../core/prepare/index.js';
import { getRootLogger, logError } from '../../core/logger/logger.js';
import { userError, userOutput } from '../output.js';
import { withSpinner } from '../../core/spinner.js';
import type { GlobalOpts } from '../options.js';
import { resolveCampaign } from '../campaign.js';

/**
 * `jho prepare show [<slug>]` — display an existing prep plan.
 */
const showCommand = new Command('show')
  .description('Show an existing prep plan (slug inferred from cwd if omitted)')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .action(async function (slug: string | undefined) {
    const globals = this.parent?.parent?.opts() as GlobalOpts | undefined;
    const campaign = await resolveCampaign(globals);
    const log = getRootLogger().child({ cmd: 'prepare.show', campaign });

    try {
      const resolvedSlug = resolveSlug(slug, campaign);
      const raw = await readPrep(campaign, resolvedSlug);
      const content = raw.replace(/^<!-- jho:(?:start|end):[^>]+ -->\s*\n?/gm, '');
      userOutput(content);
      log.info({ slug: resolvedSlug }, 'prepare.show.completed');
    } catch (err) {
      if (err instanceof SlugMissingError) {
        logError(log, err, 'prepare.show.slug-missing', { campaign });
        log.flush();
        userError(
          `${err.message}\nhint: pass a slug, or run from inside the application folder (e.g. cd applied/<slug>)`,
        );
        process.exit(1);
      }
      if (err instanceof PrepReadError) {
        logError(log, err, 'prepare.show.file-missing', { campaign });
        log.flush();
        userError(err.message);
        process.exit(1);
      }
      throw err;
    }
  });

showCommand.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory
— run from inside an application folder (e.g. cd applied/<slug>) to skip it.

Examples:
  $ jho prepare show                                        # infer slug from cwd
  $ jho prepare show 2026-Jan-15-frontend-acme-12345        # explicit slug
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho prepare show
`,
);

/**
 * `jho prepare [<slug>|<url>]` — pre-interview prep plan.
 * Slug is optional; inferred from cwd when omitted.
 */
export const prepareCommand = new Command('prepare')
  .description('Generate or show prep plans (slug inferred from cwd if omitted)')
  .argument('[slugOrUrl]', 'application slug or job posting URL')
  .option('--add <topic>', 'add a topic to brush up on')
  .option('--text <text>', 'paste job description text (ad-hoc, prints to stdout)')
  .option('--days <n>', 'number of days until the interview', '7')
  .option('--steer <text>', 'instructions to guide the prep plan generation')
  .option('--json', 'output as JSON')
  .addCommand(showCommand)
  .action(async function (slugOrUrl: string | undefined, opts) {
    const globals = this.parent?.opts() as GlobalOpts | undefined;
    const campaign = await resolveCampaign(globals);
    const log = getRootLogger().child({ cmd: 'prepare', campaign });

    try {
      const days = parseInt(opts.days as string, 10) || 7;

      // Append mode — add topic without LLM
      if (opts.add) {
        if (!slugOrUrl) {
          userError('slug is required when using --add');
          process.exit(1);
        }
        const resolvedSlug = resolveSlug(slugOrUrl, campaign);
        await appendTopic(campaign, resolvedSlug, opts.add as string);
        userOutput(`Topic added: ${opts.add}`);
        log.info({ slug: resolvedSlug, topic: opts.add }, 'prepare.topic-added');
        return;
      }

      // URL mode — ad-hoc from URL
      if (slugOrUrl && isUrl(slugOrUrl)) {
        const { global } = getConfig(campaign);
        const llmConfig = defaultLlmConfig(global);

        const extracted = await withSpinner(
          'Fetching job posting...',
          'Job posting fetched',
          () => extractJdFromUrl(slugOrUrl, llmConfig, log),
          'Failed to fetch job posting',
        );

        const jdText = extracted.rawText ?? extracted.description;

        const result = await withSpinner(
          'Generating prep plan...',
          'Prep plan generated',
          () =>
            generatePrepFromText({
              jdText,
              campaign,
              days,
              steer: opts.steer as string | undefined,
            }),
          'Failed to generate prep plan',
        );

        if (opts.json) {
          userOutput(JSON.stringify({ slug: null, ...result }, null, 2));
        } else {
          userOutput(result.content);
        }

        log.info(
          { url: slugOrUrl, model: result.model, wordCount: result.wordCount },
          'prepare.completed',
        );
        return;
      }

      // Text mode — ad-hoc from pasted text
      if (opts.text) {
        const result = await withSpinner(
          'Generating prep plan...',
          'Prep plan generated',
          () =>
            generatePrepFromText({
              jdText: opts.text as string,
              campaign,
              days,
              steer: opts.steer as string | undefined,
            }),
          'Failed to generate prep plan',
        );

        if (opts.json) {
          userOutput(JSON.stringify({ slug: null, ...result }, null, 2));
        } else {
          userOutput(result.content);
        }

        log.info({ model: result.model, wordCount: result.wordCount }, 'prepare.completed');
        return;
      }

      // Default mode — generate for an application
      const resolvedSlug = resolveSlug(slugOrUrl, campaign);

      const result = await withSpinner(
        'Generating prep plan...',
        'Prep plan generated',
        () =>
          generatePrep({
            slug: resolvedSlug,
            campaign,
            days,
            steer: opts.steer as string | undefined,
          }),
        'Failed to generate prep plan',
      );

      if (opts.json) {
        userOutput(JSON.stringify({ slug: resolvedSlug, ...result }, null, 2));
      } else {
        userOutput(result.content);

        // Show file path and next steps
        const campaignRoot = resolveCampaignRoot(campaign);
        const appliedDir = resolveAppliedDir(campaignRoot);
        const prepPath = join(appliedDir, resolvedSlug, 'prepare.md');

        userOutput(`Prep plan saved to: ${prepPath}

Next steps:
  jho prepare show ${resolvedSlug}     # view the saved prep plan
  jho prepare ${resolvedSlug} --add "React hooks"  # add a topic without LLM
  jho interview ${resolvedSlug} add    # schedule the interview
  jho retro ${resolvedSlug}           # after the interview, record a post-mortem
`);
      }

      log.info(
        { slug: resolvedSlug, model: result.model, wordCount: result.wordCount },
        'prepare.completed',
      );
    } catch (err) {
      if (err instanceof SlugMissingError) {
        logError(log, err, 'prepare.slug-missing', { campaign });
        log.flush();
        userError(
          `${err.message}\nhint: pass a slug, or run from inside the application folder (e.g. cd applied/<slug>)`,
        );
        process.exit(1);
      }
      if (err instanceof PrepNotFoundError) {
        logError(log, err, 'prepare.not-found', { campaign });
        log.flush();
        userError(`${err.message}\nhint: generate one with: jho prepare ${slugOrUrl}`);
        process.exit(1);
      }
      if (err instanceof PrepError) {
        logError(log, err, 'prepare.failed', { campaign });
        log.flush();
        userError(err.message);
        process.exit(1);
      }
      throw err;
    }
  });

prepareCommand.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory
— run from inside an application folder (e.g. cd applied/<slug>) to skip it.

Ad-hoc modes (print to stdout, don't save):
  jho prepare <url>            extract JD from URL, print prep plan
  jho prepare --text "..."     paste JD text, print prep plan

Commands:
  show [<slug>]    Show an existing prep plan

Examples:
  $ jho prepare                                             # generate prep plan (infer slug from cwd)
  $ jho prepare --days 7                                    # prep for interview in 7 days
  $ jho prepare --add "React hooks"                         # add a topic
  $ jho prepare --json                                      # JSON output
  $ jho prepare 2026-Jan-15-frontend-acme-12345             # explicit slug
  $ jho prepare https://example.com/job/123                 # ad-hoc from URL
  $ jho prepare --text "We need a senior React dev..."      # ad-hoc from pasted text
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho prepare
`,
);
