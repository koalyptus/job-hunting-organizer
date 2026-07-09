import { Command } from 'commander';
import { resolveCampaignName, resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { resolveSlug } from '../slug.js';
import { repairAll, repairApp, RepairError } from '../../core/repair/index.js';
import type { RepairResult } from '../../core/repair/types.js';
import { getRootLogger, logError } from '../../core/logger/logger.js';
import { userError, userOutput } from '../output.js';
import { withSpinner } from '../../core/spinner.js';
import type { GlobalOpts } from '../options.js';

/**
 * Format repair results as readable output.
 */
function formatResult(result: RepairResult, campaignWide: boolean): string {
  if (result.actions.length === 0) {
    return 'Nothing to repair.';
  }

  const lines: string[] = [];

  // Group actions by slug for campaign-wide output
  if (campaignWide) {
    const bySlug = new Map<string | null, typeof result.actions>();
    for (const action of result.actions) {
      if (!bySlug.has(action.slug)) {
        bySlug.set(action.slug, []);
      }
      bySlug.get(action.slug)!.push(action);
    }

    for (const [slug, actions] of bySlug) {
      const slugPart = slug ? ` (${slug})` : '';
      for (const action of actions) {
        lines.push(`  ${action.message}${slugPart}`);
      }
    }
  } else {
    for (const action of result.actions) {
      lines.push(`  ${action.message}`);
    }
  }

  // Summary line
  const slugs = new Set(result.actions.map((a) => a.slug).filter(Boolean));
  if (campaignWide && slugs.size > 0) {
    lines.push(
      `\nPerformed ${result.actions.length} repair action(s) across ${slugs.size} application(s).`,
    );
  } else {
    lines.push(`\nPerformed ${result.actions.length} repair action(s).`);
  }

  return lines.join('\n');
}

/**
 * `jho repair [<slug>]` — attempt auto-repair.
 */
export const repairCommand = new Command('repair')
  .description(
    'Attempt auto-repair for the campaign or a single application (slug inferred from cwd if omitted)',
  )
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .action(async function (slug: string | undefined) {
    const globals = this.parent?.opts() as GlobalOpts | undefined;
    const campaign = resolveCampaignName(globals?.campaign);
    const log = getRootLogger().child({ cmd: 'repair', campaign });

    try {
      const campaignRoot = resolveCampaignRoot(campaign);

      if (slug) {
        // Single app repair
        const resolvedSlug = resolveSlug(slug, campaign);
        const appliedDir = resolveAppliedDir(campaignRoot);

        const result = await withSpinner(
          `Repairing ${resolvedSlug}...`,
          'Repair complete',
          () => repairApp(appliedDir, resolvedSlug),
          'Repair failed',
        );

        userOutput(formatResult(result, false));
        log.info(
          { slug: resolvedSlug, actionCount: result.actions.length },
          'repair.app.completed',
        );
      } else {
        // Campaign-wide repair
        const result = await withSpinner(
          'Repairing campaign...',
          'Repair complete',
          () => repairAll(campaignRoot),
          'Repair failed',
        );

        userOutput(formatResult(result, true));
        log.info({ actionCount: result.actions.length }, 'repair.all.completed');
      }
    } catch (err) {
      if (err instanceof RepairError) {
        logError(log, err, 'repair.failed', { campaign });
        log.flush();
        userError(err.message);
        process.exit(1);
      }
      throw err;
    }
  });

repairCommand.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory
— run from inside an application folder (e.g. cd applied/<slug>) to skip it,
or omit it to repair the entire campaign.

Examples:
  $ jho repair                                                # repair the campaign
  $ jho repair 2026-Jan-15-frontend-acme-12345                # repair one application
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho repair  # infer from cwd
`,
);
