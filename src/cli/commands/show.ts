import { Command } from 'commander';
import { resolveCampaignName, resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { resolveSlug, SlugMissingError } from '../slug.js';
import { readShowData, ShowError } from '../../core/applications/index.js';
import { OWNERSHIP_ROWS } from '../../core/ownership.js';
import { getRootLogger, logError } from '../../core/logger/logger.js';
import { userOutput, userError } from '../output.js';
import { dim, cyan, statusColor, green } from '../colors.js';
import type { GlobalOpts } from '../options.js';
import type { OwnershipRow } from '../../core/types.js';

/**
 * Render the summary view for an application.
 */
function renderSummary(data: Awaited<ReturnType<typeof readShowData>>): void {
  const { frontmatter, filesPresent } = data;
  userOutput(`${cyan(frontmatter.slug)}`);
  if (frontmatter.title) {
    userOutput(`  ${dim('Title:')} ${frontmatter.title}`);
  }
  if (frontmatter.company) {
    userOutput(`  ${dim('Company:')} ${frontmatter.company}`);
  }
  userOutput(`  ${dim('Status:')} ${statusColor(frontmatter.status)}`);
  if (frontmatter.appliedOn) {
    userOutput(`  ${dim('Applied on:')} ${frontmatter.appliedOn}`);
  }
  if (frontmatter.location) {
    userOutput(`  ${dim('Location:')} ${frontmatter.location}`);
  }
  if (frontmatter.site) {
    userOutput(`  ${dim('Site:')} ${frontmatter.site}`);
  }
  if (frontmatter.salary) {
    userOutput(`  ${dim('Salary:')} ${frontmatter.salary}`);
  }
  if (frontmatter.tags.length > 0) {
    userOutput(`  ${dim('Tags:')} ${frontmatter.tags.join(', ')}`);
  }
  if (frontmatter.targetRole) {
    userOutput(`  ${dim('Target role:')} ${frontmatter.targetRole}`);
  }
  if (frontmatter.link) {
    userOutput(`  ${dim('Link:')} ${frontmatter.link}`);
  }

  // File presence indicators
  userOutput(`  ${dim('Files:')} ${filesPresent.map((f) => colorFileName(f)).join(' ')}`);
}

/**
 * Color a file name green if present (tool-managed) or dim if absent.
 */
function colorFileName(file: string): string {
  return green(file);
}

/**
 * Map from file name to the ownership row's `file` prefix for matching.
 * Ownership rows use descriptive labels like "meta.md (the metadata fields at the top)".
 */
const FILE_TO_OWNERSHIP_PREFIX: Record<string, string> = {
  'meta.md': 'meta.md',
  'jd.md': 'jd.md',
  'cover-letter.md': 'cover-letter.md',
  'qa.md': 'qa.md',
  'interviews.md': 'interviews.md',
  'retro.md': 'retro.md',
  'prepare.md': 'prepare.md',
  'notes.md': 'notes.md',
};

/**
 * Render a compact ownership footer filtered to files present in the app folder.
 */
function renderOwnershipFooter(filesPresent: string[]): void {
  const fileSet = new Set(filesPresent);
  const filtered = OWNERSHIP_ROWS.filter((row: OwnershipRow) => {
    for (const file of fileSet) {
      const prefix = FILE_TO_OWNERSHIP_PREFIX[file];
      if (prefix && row.file.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  });

  if (filtered.length === 0) {
    return;
  }

  userOutput(
    `  ${dim('File ownership')} — the tool follows these rules. Source of truth: ${dim('AGENTS.md')}.`,
  );
  for (const row of filtered) {
    userOutput(
      `    ${cyan(row.file)} ${dim('·')} ${dim('tool:')} ${row.toolWrites} ${dim('·')} ${dim('edit:')} ${row.editFreely}`,
    );
  }
}

/**
 * `jho show [<slug>]` — show one application summary.
 * Slug is optional; inferred from cwd when omitted.
 */
export const showCommand = new Command('show')
  .description('Show one application summary (slug inferred from cwd if omitted)')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')

  .action(async function (slug: string | undefined) {
    const globals = this.parent?.opts() as GlobalOpts | undefined;
    const campaign = resolveCampaignName(globals?.campaign);
    const log = getRootLogger().child({ cmd: 'show', campaign });

    try {
      const resolvedSlug = resolveSlug(slug, campaign);
      const appliedDir = resolveAppliedDir(resolveCampaignRoot(campaign));

      const data = await readShowData(appliedDir, resolvedSlug);
      renderSummary(data);
      renderOwnershipFooter(data.filesPresent);

      log.info({ slug: resolvedSlug }, 'show.completed');
    } catch (err) {
      if (err instanceof SlugMissingError) {
        logError(log, err, 'show.slug-missing', { campaign });
        log.flush();
        userError(
          `${err.message}\nhint: pass a slug, or run from inside the application folder (e.g. cd applied/<slug>)`,
        );
        process.exit(1);
      }
      if (err instanceof ShowError) {
        logError(log, err, 'show.failed', { campaign });
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

Shows a summary with all metadata fields and file-ownership footer.

Examples:
  $ jho show                                                  # infer slug from cwd
  $ jho show 2026-Jan-15-frontend-acme-12345                  # explicit slug
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho show    # infer from cwd
`,
);
