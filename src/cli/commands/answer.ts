import { Command } from 'commander';
import { resolveCampaignName } from '../../core/paths.js';
import { resolveSlug, SlugMissingError } from '../slug.js';
import {
  answerQuestion,
  readQa,
  AnswerError,
  QaReadError,
} from '../../core/applications/application-qa.js';
import { getRootLogger, logError } from '../../core/logger/logger.js';
import { userError, userOutput } from '../output.js';
import { withSpinner } from '../../core/spinner.js';
import { readStdin } from '../stdin.js';
import type { GlobalOpts } from '../options.js';

/**
 * `jho answer show [<slug>]` — display existing Q&A entries.
 */
const showCommand = new Command('show')
  .description('Show existing Q&A entries (slug inferred from cwd if omitted)')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .action(async function (slug: string | undefined) {
    const globals = this.parent?.parent?.opts() as GlobalOpts | undefined;
    const campaign = resolveCampaignName(globals?.campaign);
    const log = getRootLogger().child({ cmd: 'answer.show', campaign });

    try {
      const resolvedSlug = resolveSlug(slug, campaign);
      const raw = await readQa(campaign, resolvedSlug);
      const content = raw.replace(/^<!-- jho:(?:start|end):[^>]+ -->\s*\n?/gm, '');
      userOutput(content);
      log.info({ slug: resolvedSlug }, 'answer.show.completed');
    } catch (err) {
      if (err instanceof SlugMissingError) {
        logError(log, err, 'answer.show.slug-missing', { campaign });
        log.flush();
        userError(
          `${err.message}\nhint: pass a slug, or run from inside the application folder (e.g. cd applied/<slug>)`,
        );
        process.exit(1);
      }
      if (err instanceof QaReadError) {
        logError(log, err, 'answer.show.file-missing', { campaign });
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
  $ jho answer show                                        # infer slug from cwd
  $ jho answer show 2026-Jan-15-frontend-acme-12345        # explicit slug
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho answer show
`,
);

/**
 * `jho answer [<slug>] "<question>"` — tailor an answer.
 * Slug is optional; inferred from cwd when omitted.
 */
export const answerCommand = new Command('answer')
  .description(
    'Generate or show answers to application questions (slug inferred from cwd if omitted)',
  )
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .argument('[question]', 'question to answer (or use --stdin)')
  .option('--image <path>', 'include a screenshot or image')
  .option('--stdin', 'read the question from stdin')
  .option('--no-save', 'print to stdout only (skip file write)')
  .addCommand(showCommand)
  .action(async function (slug: string | undefined, question: string | undefined, opts) {
    const globals = this.parent?.opts() as GlobalOpts | undefined;
    const campaign = resolveCampaignName(globals?.campaign);
    const log = getRootLogger().child({ cmd: 'answer', campaign });

    try {
      // Resolve question from --stdin if needed
      let resolvedQuestion = question;
      if (opts.stdin === true) {
        resolvedQuestion = await readStdin();
      }

      if (!resolvedQuestion) {
        userError(
          'missing question argument\nhint: pass a question as an argument, or use --stdin',
        );
        process.exit(1);
      }

      // Resolve slug
      const resolvedSlug = resolveSlug(slug, campaign);

      const result = await withSpinner(
        'Generating answer...',
        'Answer generated',
        () =>
          answerQuestion({
            slug: resolvedSlug,
            campaign,
            question: resolvedQuestion!,
            imagePath: opts.image as string | undefined,
            noSave: opts.save === false,
          }),
        'Failed to generate answer',
      );

      // Always print to stdout
      userOutput(result.answer);

      log.info(
        { slug: resolvedSlug, model: result.model, wordCount: result.wordCount },
        'answer.completed',
      );
    } catch (err) {
      if (err instanceof SlugMissingError) {
        logError(log, err, 'answer.slug-missing', { campaign });
        log.flush();
        userError(
          `${err.message}\nhint: pass a slug, or run from inside the application folder (e.g. cd applied/<slug>)`,
        );
        process.exit(1);
      }
      if (err instanceof AnswerError) {
        logError(log, err, 'answer.failed', { campaign });
        log.flush();
        userError(err.message);
        process.exit(1);
      }
      throw err;
    }
  });

answerCommand.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory
— run from inside an application folder (e.g. cd applied/<slug>) to skip it.

The answer is printed to stdout and appended to qa.md in the application folder.

Commands:
  show [<slug>]    Show existing Q&A entries

Examples:
  $ jho answer "Tell me about yourself"                      # infer slug from cwd
  $ jho answer 2026-Jan-15-frontend-acme-12345 "Why our company?"  # explicit slug
  $ jho answer --stdin < question.txt
  $ jho answer --image screenshot.png "What is this UI?"
  $ jho answer show                                          # show existing (infer slug)
  $ jho answer show 2026-Jan-15-frontend-acme-12345          # show existing (explicit slug)
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho answer "Tell me about yourself"
  $ jho answer "Why this role?" --no-save                    # print only, skip qa.md
`,
);
