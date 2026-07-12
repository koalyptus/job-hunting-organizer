import { Command } from 'commander';
import { join } from 'node:path';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { resolveSlug, SlugMissingError } from '../slug.js';
import {
  generateCoverLetter,
  readCoverLetter,
  CoverLetterError,
  CoverLetterReadError,
} from '../../core/applications/cover-letter.js';
import { getRootLogger, logError } from '../../core/logger/logger.js';
import { userError, userOutput } from '../output.js';
import { withSpinner } from '../../core/spinner.js';
import { renderMarkdown } from '../markdown.js';
import type { GlobalOpts } from '../options.js';
import { resolveCampaign } from '../campaign.js';

/**
 * `jho cover-letter show [<slug>]` — display an existing cover letter.
 */
const showCommand = new Command('show')
  .description('Show an existing cover letter (slug inferred from cwd if omitted)')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .action(async function (slug: string | undefined) {
    const globals = this.parent?.parent?.opts() as GlobalOpts | undefined;
    const campaign = await resolveCampaign(globals);
    const log = getRootLogger().child({ cmd: 'cover-letter.show', campaign });

    try {
      const resolvedSlug = resolveSlug(slug, campaign);
      const raw = await readCoverLetter(campaign, resolvedSlug);
      const content = raw.replace(/<!--[\s\S]*?-->\s*\n?/gm, '');
      userOutput(renderMarkdown(content));
      log.info({ slug: resolvedSlug }, 'cover-letter.show.completed');
    } catch (err) {
      if (err instanceof SlugMissingError) {
        logError(log, err, 'cover-letter.show.slug-missing', { campaign });
        log.flush();
        userError(
          `${err.message}\nhint: pass a slug, or run from inside the application folder (e.g. cd applied/<slug>)`,
        );
        process.exit(1);
      }
      if (err instanceof CoverLetterReadError) {
        logError(log, err, 'cover-letter.show.file-missing', { campaign });
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
  $ jho cover-letter show                                        # infer slug from cwd
  $ jho cover-letter show 2026-Jan-15-frontend-acme-12345        # explicit slug
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho cover-letter show
`,
);

/**
 * `jho cover-letter [<slug>]` — generate a tailored cover letter.
 * Slug is optional; inferred from cwd when omitted.
 */
export const coverLetterCommand = new Command('cover-letter')
  .description('Generate or show cover letters (slug inferred from cwd if omitted)')
  .argument('[slug]', 'application slug')
  .option('--no-save', 'print to stdout only (skip file write)')
  .option('--steer <text>', 'instructions to guide the cover letter generation')
  .addCommand(showCommand)
  .action(async function (slug: string | undefined, opts) {
    const globals = this.parent?.opts() as GlobalOpts | undefined;
    const campaign = await resolveCampaign(globals);
    const log = getRootLogger().child({ cmd: 'cover-letter', campaign });

    try {
      const resolvedSlug = resolveSlug(slug, campaign);

      const result = await withSpinner(
        'Generating cover letter...',
        'Cover letter generated',
        () =>
          generateCoverLetter({
            slug: resolvedSlug,
            campaign,
            noSave: opts.save === false,
            steer: opts.steer as string | undefined,
          }),
        'Failed to generate cover letter',
      );

      // Always print to stdout
      userOutput(result.content);

      // Show file path and next steps when saved to file
      if (opts.save !== false) {
        const campaignRoot = resolveCampaignRoot(campaign);
        const appliedDir = resolveAppliedDir(campaignRoot);
        const coverLetterPath = join(appliedDir, resolvedSlug, 'cover-letter.md');

        userOutput(`Cover letter saved to: ${coverLetterPath}

Next steps:
  jho cover-letter show ${resolvedSlug}  # view saved cover letter
  jho show ${resolvedSlug}              # view application details
  jho answer ${resolvedSlug} "question" # answer application questions
`);
      }

      log.info(
        { slug: resolvedSlug, model: result.model, wordCount: result.wordCount },
        'cover-letter.completed',
      );
    } catch (err) {
      if (err instanceof SlugMissingError) {
        logError(log, err, 'cover-letter.slug-missing', { campaign });
        log.flush();
        userError(
          `${err.message}\nhint: pass a slug, or run from inside the application folder (e.g. cd applied/<slug>)`,
        );
        process.exit(1);
      }
      if (err instanceof CoverLetterError) {
        logError(log, err, 'cover-letter.failed', { campaign });
        log.flush();
        userError(err.message);
        process.exit(1);
      }
      throw err;
    }
  });

coverLetterCommand.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory
— run from inside an application folder (e.g. cd applied/<slug>) to skip it.

Commands:
  show [<slug>]    Show an existing cover letter

Examples:
  $ jho cover-letter                                        # infer slug from cwd, print to stdout
  $ jho cover-letter --no-save                              # print to stdout only
  $ jho cover-letter 2026-Jan-15-frontend-acme-12345        # explicit slug
  $ jho cover-letter show                                   # show existing (infer slug)
  $ jho cover-letter show 2026-Jan-15-frontend-acme-12345   # show existing (explicit slug)
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho cover-letter
`,
);
