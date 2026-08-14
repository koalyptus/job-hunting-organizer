import { Command } from 'commander';
import { join, relative } from 'node:path';
import { confirm, isCancel, log as clackLog } from '@clack/prompts';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { resolveSlug, SlugMissingError } from '../slug.js';
import { deleteApplication, ApplicationNotFoundError } from '../../core/applications/index.js';
import { getRootLogger, logError } from '../../core/logger/logger.js';
import { userError, userSuccess, userInfo } from '../output.js';
import { bold, cyan } from '../colors.js';
import { createStore } from '../../storage/index.js';
import type { GlobalOpts } from '../options.js';
import { resolveCampaign } from '../campaign.js';

/**
 * Ask the user to confirm permanent removal of an application.
 * @param slug - The application slug to display in the prompt.
 * @returns `'confirmed'`, `'cancelled'` (Ctrl+C/Esc), or `'declined'` (No).
 */
async function confirmRemoval(slug: string): Promise<'confirmed' | 'cancelled' | 'declined'> {
  clackLog.warn('This permanently deletes the application folder and everything in it.');
  const confirmed = await confirm({
    message: `Remove application "${slug}"?`,
    initialValue: false,
  });

  if (isCancel(confirmed)) {
    return 'cancelled';
  }
  if (!confirmed) {
    return 'declined';
  }
  return 'confirmed';
}

/**
 * `jho remove-application [<slug>]` — permanently delete an application folder.
 */
export const removeApplicationCommand = new Command('remove-application')
  .description('Permanently remove an application folder')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .option('-y, --yes', 'skip the confirmation prompt')
  .action(async function (slug: string | undefined, opts) {
    const globals = this.parent?.opts() as GlobalOpts | undefined;
    let log = getRootLogger().child({ cmd: 'remove-application' });
    try {
      const campaign = await resolveCampaign(globals);
      log = log.child({ campaign });
      const appliedDir = resolveAppliedDir(resolveCampaignRoot(campaign));

      const resolvedSlug = resolveSlug(slug, campaign);
      log = log.child({ slug: resolvedSlug });

      // Pre-flight: the application must exist (no lock needed). Route the
      // existence check through the FileStore port rather than node:fs so no
      // CLI path touches disk directly; the store's data root is the same
      // $JHO_DATA resolution the path helpers use, so the relative path is
      // well-defined and stays inside the store root.
      const store = createStore();
      const folder = join(appliedDir, resolvedSlug);
      const applicationFolderRel = relative(store.getDataRoot(), folder);
      // `relative` only yields a store-valid StoragePath when the applied dir
      // resolves under the store's data root (same $JHO_DATA resolution the
      // path helpers use). If they ever diverge, a `..`-escaping path would
      // fall outside the store root and must never reach the port — fail
      // closed rather than silently querying an escaped path.
      if (applicationFolderRel === '' || applicationFolderRel.startsWith('..')) {
        throw new ApplicationNotFoundError(resolvedSlug);
      }
      if (!(await store.exists(applicationFolderRel))) {
        throw new ApplicationNotFoundError(resolvedSlug);
      }

      const skipConfirm = opts.yes === true || globals?.yes === true;
      if (!skipConfirm) {
        const result = await confirmRemoval(resolvedSlug);
        if (result === 'cancelled') {
          userInfo('Application removal cancelled.');
          process.exit(0);
        }
        if (result === 'declined') {
          userInfo('Application removal declined.');
          process.exit(0);
        }
      }

      const deleted = await deleteApplication(appliedDir, resolvedSlug);
      if (!deleted) {
        throw new ApplicationNotFoundError(resolvedSlug);
      }

      userSuccess(`Removed application ${bold(cyan(resolvedSlug))}`);
      log.info({ slug: resolvedSlug, campaign }, 'remove-application.completed');
      process.exit(0);
    } catch (err) {
      if (err instanceof SlugMissingError) {
        logError(log, err, 'remove-application.slug-missing', { campaign: globals?.campaign });
        log.flush();
        userError(
          `${err.message}\nhint: pass a slug, or run from inside the application folder (e.g. cd applied/<slug>)`,
        );
        process.exit(1);
      }
      if (err instanceof ApplicationNotFoundError) {
        logError(log, err, 'remove-application.not-found', { campaign: globals?.campaign });
        log.flush();
        userError(err.message);
        process.exit(1);
      }
      throw err;
    }
  });

removeApplicationCommand.addHelpText(
  'after',
  `
Permanently remove an application folder and all of its contents (meta.md,
jd.md, cover letter, Q&A, interviews, retro, prep, notes). This is destructive
and cannot be undone.

A confirmation prompt is shown unless you pass --yes.

The slug is optional. When omitted, it is inferred from the current directory
— run from inside an application folder (e.g. cd applied/<slug>) to skip it.

Examples:
  $ jho remove-application 2026-Jan-15-frontend-acme-12345   # confirm, then delete
  $ jho remove-application 2026-Jan-15-frontend-acme-12345 --yes
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho remove-application --yes
`,
);
