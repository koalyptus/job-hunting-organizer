import { Command } from 'commander';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { resolveSlug, SlugMissingError } from '../slug.js';
import {
  renameApplication,
  RenameApplicationError,
  InvalidSlugError,
  SelfRenameError,
} from '../../core/applications/rename.js';
import { getRootLogger } from '../../core/logger/logger.js';
import { userError, userSuccess } from '../output.js';
import { bold, cyan } from '../colors.js';
import type { GlobalOpts } from '../options.js';
import { resolveCampaign } from '../campaign.js';
import type { Logger } from 'pino';

/**
 * `jho rename-application <new-slug> [--from <old-slug>]` — rename an application folder.
 */
export const renameApplicationCommand = new Command('rename-application')
  .description('Rename an application folder')
  .argument('<new-slug>', 'new application slug')
  .option('--from <old-slug>', 'current application slug (inferred from cwd if omitted)')
  .action(async function (newSlug: string, opts) {
    const globals = this.parent?.opts() as GlobalOpts | undefined;
    let log: Logger | undefined;
    try {
      const campaign = await resolveCampaign(globals);
      log = getRootLogger().child({ cmd: 'rename-application', campaign });
      const appliedDir = resolveAppliedDir(resolveCampaignRoot(campaign));

      let oldSlug: string;
      if (opts.from) {
        oldSlug = opts.from;
      } else {
        oldSlug = resolveSlug(undefined, campaign);
      }

      log = log.child({ old: oldSlug, new: newSlug });
      log.info({}, 'rename-application.started');
      await renameApplication(appliedDir, oldSlug, newSlug);
      userSuccess(`Renamed application ${bold(cyan(oldSlug))} → ${bold(cyan(newSlug))}`);
      process.exit(0);
    } catch (err) {
      if (err instanceof SelfRenameError) {
        userError(`${err.message}\ncd out of the application folder first`);
        process.exit(1);
      }
      if (err instanceof InvalidSlugError) {
        userError(
          `${err.message}\nhint: slug must match the pattern YYYY-MMM-DD-role-company (e.g. 2026-Jun-03-SE-acme)`,
        );
        process.exit(1);
      }
      if (err instanceof SlugMissingError) {
        userError(
          `${err.message}\nhint: pass the old slug with --from, or run from inside the application folder (e.g. cd applied/<slug>)`,
        );
        process.exit(1);
      }
      if (err instanceof RenameApplicationError) {
        userError(err.message);
        process.exit(1);
      }
      throw err;
    }
  });

renameApplicationCommand.addHelpText(
  'after',
  `
Rename an application folder. Validates the new slug, acquires a lock,
performs an atomic rename, updates meta.md, and rebuilds the index.

Examples:
  $ jho rename-application 2026-Jun-03-SE-acme --from 2026-Jun-03-FE-acme
  $ cd applied/2026-Jun-03-FE-acme && jho rename-application 2026-Jun-03-SE-acme
`,
);
