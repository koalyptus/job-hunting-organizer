import { Command } from 'commander';
import Table from 'cli-table3';
import { resolveCampaignName, resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { resolveSlug, SlugMissingError } from '../slug.js';
import { readShowData, ShowError } from '../../core/applications/index.js';
import { getRootLogger, logError } from '../../core/logger/logger.js';
import { userOutput, userError } from '../output.js';
import { dim, cyan, statusColor, green } from '../colors.js';
import type { GlobalOpts } from '../options.js';

/**
 * Unified file-table rows: maps each known application file to its
 * creator command and a one-line note.
 */
const FILE_TABLE: Record<string, { createdBy: string; notes: string }> = {
  'jd.md': {
    createdBy: 'jho track',
    notes: 'Auto-fetched JD at top; your comments survive re-fetches',
  },
  'meta.md': {
    createdBy: 'jho track',
    notes: 'Known fields rewritten on track; custom keys & body text kept',
  },
  'cover-letter.md': {
    createdBy: 'jho cover-letter',
    notes: 'Regenerated on demand; asks before overwriting your edits',
  },
  'qa.md': { createdBy: 'jho answer', notes: 'Appends new entries; old entries stay as written' },
  'interviews.md': {
    createdBy: 'jho interview',
    notes: 'Appends entries; status updated with mark',
  },
  'retro.md': { createdBy: 'jho retro', notes: 'Appends a section per retro' },
  'prepare.md': { createdBy: 'jho prepare', notes: 'Rewrites on prepare; appends on --add' },
};

/**
 * Render the summary view for an application.
 */
function renderSummary(data: Awaited<ReturnType<typeof readShowData>>): void {
  const { frontmatter } = data;
  const labels: { label: string; value: string | undefined }[] = [
    { label: 'Title', value: frontmatter.title },
    { label: 'Company', value: frontmatter.company },
    { label: 'Status', value: statusColor(frontmatter.status) },
    { label: 'Applied', value: frontmatter.appliedOn },
    { label: 'Location', value: frontmatter.location },
    { label: 'Site', value: frontmatter.site },
    { label: 'Salary', value: frontmatter.salary },
    { label: 'Tags', value: frontmatter.tags.length > 0 ? frontmatter.tags.join(', ') : undefined },
    { label: 'Target role', value: frontmatter.targetRole },
    { label: 'Link', value: frontmatter.link },
  ];

  const maxLabelWidth = Math.max(...labels.map((e) => e.label.length));
  const lines: string[] = [cyan(frontmatter.slug)];
  for (const entry of labels) {
    if (entry.value) {
      lines.push(`  ${dim(entry.label.padEnd(maxLabelWidth))}  ${entry.value}`);
    }
  }
  userOutput(lines.join('\n'));
}

/**
 * Render a unified file table showing each present file, the command
 * that created it, and a short note about how the tool manages it.
 */
function renderFileTable(filesPresent: string[]): void {
  const fileSet = new Set(filesPresent);
  const rows = Object.entries(FILE_TABLE).filter(([file]) => fileSet.has(file));

  if (rows.length === 0) {
    return;
  }

  const table = new Table({
    style: { head: [], border: [] },
    wordWrap: true,
  });

  table.push([dim('File'), dim('Created by'), dim('Notes')]);
  for (const [file, info] of rows) {
    table.push([green(file), cyan(info.createdBy), info.notes]);
  }

  userOutput(`\n${dim('Available files')}\n${table.toString().trimEnd()}`);
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
      renderFileTable(data.filesPresent);

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

Shows a summary with all metadata fields (grid layout) and a file table
listing each file, the command that manages it, and a note.

Examples:
  $ jho show                                                  # infer slug from cwd
  $ jho show 2026-Jan-15-frontend-acme-12345                  # explicit slug
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho show    # infer from cwd
`,
);
