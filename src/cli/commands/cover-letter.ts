import { Command } from 'commander';
import { resolveCampaignName, resolveCampaignRoot } from '../../core/paths.js';
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
import { isUrl } from '../../core/url.js';
import { extractJdFromUrl } from '../../core/jobs/extract.js';
import type { ExtractedJd } from '../../core/jobs/types.js';
import { getConfig } from '../../core/config.js';
import { defaultLlmConfig, chatComplete } from '../../core/llm.js';
import { readProfile } from '../../core/profile.js';
import { loadPromptTemplate } from '../../core/prompts.js';
import type { GlobalOpts } from '../options.js';

/**
 * `jho cover-letter show [<slug>]` — display an existing cover letter.
 */
const showCommand = new Command('show')
  .description('Show an existing cover letter (slug inferred from cwd if omitted)')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .action(async function (slug: string | undefined) {
    const globals = this.parent?.parent?.opts() as GlobalOpts | undefined;
    const campaign = resolveCampaignName(globals?.campaign);
    const log = getRootLogger().child({ cmd: 'cover-letter.show', campaign });

    try {
      const resolvedSlug = resolveSlug(slug, campaign);
      const raw = await readCoverLetter(campaign, resolvedSlug);
      const content = raw.replace(/^<!-- jho:(?:start|end):[^>]+ -->\s*\n?/gm, '');
      userOutput(content);
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
 * `jho cover-letter [<slug>|<url>]` — generate a tailored cover letter.
 * Slug is optional; inferred from cwd when omitted.
 */
export const coverLetterCommand = new Command('cover-letter')
  .description('Generate or show cover letters (slug inferred from cwd if omitted)')
  .argument('[slugOrUrl]', 'application slug or job posting URL')
  .option('--no-save', 'print to stdout only (skip file write)')
  .addCommand(showCommand)
  .action(async function (slugOrUrl: string | undefined, opts) {
    const globals = this.parent?.opts() as GlobalOpts | undefined;
    const campaign = resolveCampaignName(globals?.campaign);
    const log = getRootLogger().child({ cmd: 'cover-letter', campaign });

    try {
      if (isUrl(slugOrUrl)) {
        // URL mode: fetch JD, extract, generate cover letter, stdout only
        const { global } = getConfig(campaign);
        const llmConfig = defaultLlmConfig(global);

        let jd: ExtractedJd;
        try {
          jd = await withSpinner(
            'Fetching job description...',
            'Job description fetched',
            () => extractJdFromUrl(slugOrUrl!, llmConfig, log, global.fetch?.timeoutMs),
            'Failed to fetch JD',
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          userError(`Failed to fetch JD: ${msg}`);
          process.exit(1);
        }

        // Read profile
        let profile: string;
        try {
          profile = await readProfile(resolveCampaignRoot(campaign));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          userError(`Failed to read profile: ${msg}`);
          process.exit(1);
        }

        const { body: systemPrompt, temperature } = await loadPromptTemplate('cover-letter');

        const userMessage = [
          '## Job description',
          '',
          `Title: ${jd.title}`,
          `Company: ${jd.company}`,
          `Location: ${jd.location ?? ''}`,
          '',
          jd.description,
          '',
          '---',
          '',
          '## Candidate profile',
          '',
          profile,
          '',
          '---',
          '',
          '## Target role',
          '',
          'No target role assigned (ad-hoc cover letter).',
        ].join('\n');

        const result = await withSpinner(
          'Generating cover letter...',
          'Cover letter generated',
          () =>
            chatComplete(
              [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
              ],
              llmConfig,
              { temperature },
              log,
            ),
          'Failed to generate cover letter',
        );

        userOutput(result.content.trim());
        return;
      }

      // Slug mode (or cwd-inferred)
      const slug = resolveSlug(slugOrUrl, campaign);

      const result = await withSpinner(
        'Generating cover letter...',
        'Cover letter generated',
        () =>
          generateCoverLetter({
            slug,
            campaign,
            noSave: opts.save === false,
          }),
        'Failed to generate cover letter',
      );

      // Always print to stdout
      userOutput(result.content);

      log.info(
        { slug, model: result.model, wordCount: result.wordCount },
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

Pass a URL to generate a cover letter for a job you haven't tracked yet.

Commands:
  show [<slug>]    Show an existing cover letter

Examples:
  $ jho cover-letter                                        # infer slug from cwd, print to stdout
  $ jho cover-letter --no-save                              # print to stdout only
  $ jho cover-letter 2026-Jan-15-frontend-acme-12345        # explicit slug
  $ jho cover-letter https://example.com/job/123            # from URL (ad-hoc)
  $ jho cover-letter show                                   # show existing (infer slug)
  $ jho cover-letter show 2026-Jan-15-frontend-acme-12345   # show existing (explicit slug)
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho cover-letter
`,
);
