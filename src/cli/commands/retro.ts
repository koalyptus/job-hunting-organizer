import { Command } from 'commander';
import { text, isCancel, log as clackLog } from '@clack/prompts';
import { resolveCampaignName, resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { resolveSlug, SlugMissingError } from '../slug.js';
import {
  startRetro,
  appendRetro,
  showRetro,
  aggregateRetros,
  RetroError,
  RetroNotFoundError,
} from '../../core/retro/index.js';
import { getRootLogger, logError } from '../../core/logger/logger.js';
import { userError, userOutput } from '../output.js';
import { withSpinner } from '../../core/spinner.js';
import type { GlobalOpts } from '../options.js';

/**
 * `jho retro [<slug>]` — post-mortem for failed interviews.
 * Slug is optional; inferred from cwd when omitted.
 */
export const retroCommand = new Command('retro')
  .description('Post-mortem for failed interviews (slug inferred from cwd if omitted)')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .option('--show', 'display the most recent retro')
  .option('--interview <index>', 'retro for a specific interview index')
  .option('--append', 'add weak topics to the existing retro')
  .option('--aggregate', 'show recurring weak topics across all apps')
  .option(
    '--weak-topics <topics>',
    'comma-separated weak topics (prompts interactively if omitted)',
  )
  .option('--notes <text>', 'additional context notes')
  .option('--steer <text>', 'instructions to guide the learning plan generation')
  .option('--role <slug>', 'scope to a single target role (with --aggregate)')
  .option('--include-abandoned', 'also count weak topics from abandoned apps')
  .action(async function (slug: string | undefined, opts) {
    const globals = this.parent?.opts() as GlobalOpts | undefined;
    const campaign = resolveCampaignName(globals?.campaign);
    const log = getRootLogger().child({ cmd: 'retro', campaign });

    try {
      // Aggregate mode — no slug needed
      if (opts.aggregate) {
        const campaignRoot = resolveCampaignRoot(campaign);
        const appliedDir = resolveAppliedDir(campaignRoot);
        const results = await aggregateRetros(appliedDir, {
          role: opts.role as string | undefined,
          includeAbandoned: opts.includeAbandoned as boolean | undefined,
        });

        if (results.length === 0) {
          userOutput('No recurring weak topics found.');
        } else {
          userOutput(`Recurring weak topics across ${results.length} topic(s):\n`);
          for (const r of results) {
            userOutput(`  ${r.label} (${r.count}x) — ${r.apps.join(', ')}`);
          }
        }

        log.info({ campaign, resultCount: results.length }, 'retro.aggregate.completed');
        return;
      }

      // Show mode — display existing retro
      if (opts.show) {
        const resolvedSlug = resolveSlug(slug, campaign);
        const content = await showRetro(campaign, resolvedSlug);
        userOutput(content);
        log.info({ slug: resolvedSlug }, 'retro.show.completed');
        return;
      }

      // Append mode — add weak topics to existing retro
      if (opts.append) {
        const resolvedSlug = resolveSlug(slug, campaign);

        const weakTopics = opts.weakTopics
          ? (opts.weakTopics as string)
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean)
          : await promptWeakTopics('Add weak topics to the retro:');

        if (weakTopics.length === 0) {
          userError('at least one weak topic is required');
          process.exit(1);
        }

        const result = await withSpinner(
          'Regenerating learning plan...',
          'Learning plan updated',
          () =>
            appendRetro({
              slug: resolvedSlug,
              campaign,
              weakTopics,
              notes: opts.notes as string | undefined,
              steer: opts.steer as string | undefined,
            }),
          'Failed to update learning plan',
        );

        userOutput(result.content);
        log.info(
          { slug: resolvedSlug, model: result.model, wordCount: result.wordCount },
          'retro.append.completed',
        );
        return;
      }

      // Default: start retro
      const resolvedSlug = resolveSlug(slug, campaign);

      const weakTopics = opts.weakTopics
        ? (opts.weakTopics as string)
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean)
        : await promptWeakTopics('What topics did you struggle with?');

      if (weakTopics.length === 0) {
        userError('at least one weak topic is required');
        process.exit(1);
      }

      const result = await withSpinner(
        'Generating learning plan...',
        'Learning plan generated',
        () =>
          startRetro({
            slug: resolvedSlug,
            campaign,
            weakTopics,
            notes: opts.notes as string | undefined,
            steer: opts.steer as string | undefined,
            interviewId: opts.interview ? parseInt(opts.interview as string, 10) : undefined,
          }),
        'Failed to generate learning plan',
      );

      userOutput(result.content);
      log.info(
        { slug: resolvedSlug, model: result.model, wordCount: result.wordCount },
        'retro.completed',
      );
    } catch (err) {
      if (err instanceof SlugMissingError) {
        logError(log, err, 'retro.slug-missing', { campaign });
        log.flush();
        userError(
          `${err.message}\nhint: pass a slug, or run from inside the application folder (e.g. cd applied/<slug>)`,
        );
        process.exit(1);
      }
      if (err instanceof RetroNotFoundError) {
        logError(log, err, 'retro.not-found', { campaign });
        log.flush();
        userError(`${err.message}\nhint: generate one with: jho retro ${slug}`);
        process.exit(1);
      }
      if (err instanceof RetroError) {
        logError(log, err, 'retro.failed', { campaign });
        log.flush();
        userError(err.message);
        process.exit(1);
      }
      throw err;
    }
  });

/**
 * Prompt the user for weak topics using @clack/prompts.
 * Returns an array of topic strings, or exits if cancelled.
 */
async function promptWeakTopics(placeholder: string): Promise<string[]> {
  const result = await text({
    message: placeholder,
    placeholder: 'e.g. System design, Behavioural, SQL',
  });

  if (isCancel(result)) {
    clackLog.info('Cancelled.');
    process.exit(0);
  }

  return (result as string)
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);
}

retroCommand.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory
— run from inside an application folder (e.g. cd applied/<slug>) to skip it.

Without flags, the command prompts for weak topics interactively (or use
--weak-topics for non-interactive mode) and generates a learning plan.

Commands:
  (no options)       Start a new retro (prompts for weak topics)
  --show             Show the most recent retro
  --append           Add weak topics to an existing retro
  --aggregate        Show recurring weak topics across all applications

Flags:
  --weak-topics      Comma-separated weak topics (skip the interactive prompt)
  --notes            Additional context notes
  --steer            Custom LLM instructions for this retro
  --interview <n>    Associate this retro with a specific interview
  --role <slug>      Filter aggregate results by target role
  --include-abandoned Include abandoned apps in aggregate

Examples:
  $ jho retro                                         # interactive: prompts for weak topics
  $ jho retro --weak-topics "System design, SQL"      # non-interactive
  $ jho retro --show                                  # show most recent retro
  $ jho retro --append --weak-topics "Behavioural"    # add topics to existing retro
  $ jho retro --aggregate                             # recurring weak topics across all apps
  $ jho retro --aggregate --role senior-engineer      # filtered by role
  $ jho retro 2026-Jan-15-frontend-acme-12345         # explicit slug
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho retro
`,
);
