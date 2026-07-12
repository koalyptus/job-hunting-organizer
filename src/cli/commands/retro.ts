import { Command } from 'commander';
import { join } from 'node:path';
import { text, isCancel, log as clackLog } from '@clack/prompts';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
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
import { renderMarkdown } from '../markdown.js';
import type { GlobalOpts } from '../options.js';
import { resolveCampaign } from '../campaign.js';

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

/**
 * `jho retro show [<slug>]` — display existing retro.
 */
const showCommand = new Command('show')
  .description('Display the most recent retro (slug inferred from cwd if omitted)')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .action(async function (slug: string | undefined) {
    const globals = this.parent?.parent?.opts() as GlobalOpts | undefined;
    const campaign = await resolveCampaign(globals);
    const log = getRootLogger().child({ cmd: 'retro.show', campaign });

    try {
      const resolvedSlug = resolveSlug(slug, campaign);
      const content = await showRetro(campaign, resolvedSlug);
      userOutput(renderMarkdown(content));
      log.info({ slug: resolvedSlug }, 'retro.show.completed');
    } catch (err) {
      if (err instanceof SlugMissingError) {
        logError(log, err, 'retro.show.slug-missing', { campaign });
        log.flush();
        userError(
          `${err.message}\nhint: pass a slug, or run from inside the application folder (e.g. cd applied/<slug>)`,
        );
        process.exit(1);
      }
      if (err instanceof RetroNotFoundError) {
        logError(log, err, 'retro.show.not-found', { campaign });
        log.flush();
        userError(`${err.message}\nhint: generate one with: jho retro ${slug}`);
        process.exit(1);
      }
      if (err instanceof RetroError) {
        logError(log, err, 'retro.show.failed', { campaign });
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
The slug is optional. When omitted, it is inferred from the current directory.

Examples:
  $ jho retro show                                        # infer slug from cwd
  $ jho retro show 2026-Jan-15-frontend-acme-12345        # explicit slug
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho retro show
`,
);

/**
 * `jho retro append [<slug>]` — add weak topics to an existing retro.
 */
const appendCommand = new Command('append')
  .description('Add weak topics to the existing retro (slug inferred from cwd if omitted)')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .action(async function (slug: string | undefined, _opts) {
    const globals = this.parent?.parent?.opts() as GlobalOpts | undefined;
    const campaign = await resolveCampaign(globals);
    const log = getRootLogger().child({ cmd: 'retro.append', campaign });

    // Options are defined on the parent retroCommand (Commander v15 compatibility:
    // same-named options on parent and child don't propagate to child actions).
    const parentOpts = this.parent?.opts() as Record<string, unknown> | undefined;

    try {
      const resolvedSlug = resolveSlug(slug, campaign);

      const weakTopics = parentOpts?.weakTopics
        ? (parentOpts.weakTopics as string)
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
            notes: parentOpts?.notes as string | undefined,
            steer: parentOpts?.steer as string | undefined,
          }),
        'Failed to update learning plan',
      );

      userOutput(result.content);

      // Show file path and next steps
      const campaignRoot = resolveCampaignRoot(campaign);
      const appliedDir = resolveAppliedDir(campaignRoot);
      const retroPath = join(appliedDir, resolvedSlug, 'retro.md');

      userOutput(`Retro saved to: ${retroPath}

Next steps:
  jho retro show ${resolvedSlug}      # view the updated retro
  jho retro aggregate                 # see recurring weak topics
  jho prepare ${resolvedSlug}         # generate prep plan using retro data
`);

      log.info(
        { slug: resolvedSlug, model: result.model, wordCount: result.wordCount },
        'retro.append.completed',
      );
    } catch (err) {
      if (err instanceof SlugMissingError) {
        logError(log, err, 'retro.append.slug-missing', { campaign });
        log.flush();
        userError(
          `${err.message}\nhint: pass a slug, or run from inside the application folder (e.g. cd applied/<slug>)`,
        );
        process.exit(1);
      }
      if (err instanceof RetroNotFoundError) {
        logError(log, err, 'retro.append.not-found', { campaign });
        log.flush();
        userError(`${err.message}\nhint: generate one with: jho retro ${slug}`);
        process.exit(1);
      }
      if (err instanceof RetroError) {
        logError(log, err, 'retro.append.failed', { campaign });
        log.flush();
        userError(err.message);
        process.exit(1);
      }
      throw err;
    }
  });

appendCommand.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory.

Options (use before the subcommand on the retro command, e.g. jho retro --weak-topics "..." append):
  --weak-topics      Comma-separated weak topics to add
  --notes            Additional context notes
  --steer            Custom LLM instructions for this retro

Examples:
  $ jho retro append                                        # interactive: prompts for weak topics
  $ jho retro --weak-topics "Behavioural, SQL" append       # non-interactive
  $ jho retro append 2026-Jan-15-frontend-acme-12345        # explicit slug
`,
);

/**
 * `jho retro aggregate` — cross-app recurring weak topics.
 */
const aggregateCommand = new Command('aggregate')
  .description('Show recurring weak topics across all applications')
  .option('--role <slug>', 'scope to a single target role')
  .option('--include-abandoned', 'also count weak topics from abandoned apps')
  .action(async function (opts) {
    const globals = this.parent?.parent?.opts() as GlobalOpts | undefined;
    const campaign = await resolveCampaign(globals);
    const log = getRootLogger().child({ cmd: 'retro.aggregate', campaign });

    try {
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
    } catch (err) {
      if (err instanceof RetroError) {
        logError(log, err, 'retro.aggregate.failed', { campaign });
        log.flush();
        userError(err.message);
        process.exit(1);
      }
      throw err;
    }
  });

aggregateCommand.addHelpText(
  'after',
  `
Examples:
  $ jho retro aggregate
  $ jho retro aggregate --role senior-engineer
  $ jho retro aggregate --include-abandoned
`,
);

/**
 * `jho retro [<slug>]` — post-mortem for failed interviews.
 * Slug is optional; inferred from cwd when omitted.
 */
export const retroCommand = new Command('retro')
  .description('Post-mortem for failed interviews (slug inferred from cwd if omitted)')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .option('--interview <index>', 'retro for a specific interview index')
  .option(
    '--weak-topics <topics>',
    'comma-separated weak topics (prompts interactively if omitted)',
  )
  .option('--notes <text>', 'additional context notes')
  .option('--steer <text>', 'instructions to guide the learning plan generation')
  .addCommand(showCommand)
  .addCommand(appendCommand)
  .addCommand(aggregateCommand)
  .action(async function (slug: string | undefined, opts) {
    const globals = this.parent?.opts() as GlobalOpts | undefined;
    const campaign = await resolveCampaign(globals);
    const log = getRootLogger().child({ cmd: 'retro', campaign });

    try {
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

      // Show file path and next steps
      const campaignRoot = resolveCampaignRoot(campaign);
      const appliedDir = resolveAppliedDir(campaignRoot);
      const retroPath = join(appliedDir, resolvedSlug, 'retro.md');

      userOutput(`Retro saved to: ${retroPath}

Next steps:
  jho retro show ${resolvedSlug}       # view the saved retro
  jho retro append ${resolvedSlug}     # add more weak topics
  jho prepare ${resolvedSlug}          # generate prep plan using retro data
`);

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

retroCommand.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory.

Without a subcommand, generates a new learning plan (prompts for weak topics
interactively, or use --weak-topics for non-interactive mode).

Subcommands:
  show              Show the most recent retro
  append            Add weak topics to an existing retro
  aggregate         Show recurring weak topics across all applications

Flags (generate mode):
  --weak-topics      Comma-separated weak topics (skip the interactive prompt)
  --notes            Additional context notes
  --steer            Custom LLM instructions for this retro
  --interview <n>    Associate this retro with a specific interview

Examples:
  $ jho retro                                         # interactive: prompts for weak topics
  $ jho retro --weak-topics "System design, SQL"      # non-interactive
  $ jho retro show                                    # show most recent retro
  $ jho retro --weak-topics "Behavioural" append      # add topics to existing retro
  $ jho retro aggregate                               # recurring weak topics across all apps
  $ jho retro aggregate --role senior-engineer        # filtered by role
  $ jho retro 2026-Jan-15-frontend-acme-12345         # explicit slug
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho retro
`,
);
