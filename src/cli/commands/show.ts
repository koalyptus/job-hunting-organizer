import { Command } from 'commander';
import Table from 'cli-table3';
import { resolveCampaignRoot, resolveAppliedDir } from '../../core/paths.js';
import { resolveSlug, SlugMissingError } from '../slug.js';
import { readShowData, readShowFile, ShowError } from '../../core/applications/index.js';
import { getRootLogger, logError } from '../../core/logger/logger.js';
import { userOutput, userError } from '../output.js';
import { dim, cyan, statusColor, green } from '../colors.js';
import type { GlobalOpts } from '../options.js';
import { resolveCampaignCli } from '../campaign.js';

interface FileTableEntry {
  file: string;
  createdBy: string;
  notes: string;
}

/**
 * Unified file-table rows, ordered by display priority (meta.md first).
 * Each entry maps an application file to the command that manages it
 * and a one-line note about the tool's behavior.
 */
const FILE_TABLE: FileTableEntry[] = [
  {
    file: 'meta.md',
    createdBy: 'jho track',
    notes: 'Known fields rewritten on track; custom keys & body text kept',
  },
  {
    file: 'jd.md',
    createdBy: 'jho track',
    notes: 'Auto-fetched JD at top; your comments survive re-fetches',
  },
  {
    file: 'cover-letter.md',
    createdBy: 'jho cover-letter',
    notes: 'Regenerated on demand; asks before overwriting your edits',
  },
  {
    file: 'qa.md',
    createdBy: 'jho answer',
    notes: 'Appends new entries; old entries stay as written',
  },
  {
    file: 'interviews.md',
    createdBy: 'jho interview',
    notes: 'Appends entries; status updated with mark',
  },
  { file: 'retro.md', createdBy: 'jho retro', notes: 'Appends a section per retro' },
  { file: 'prepare.md', createdBy: 'jho prepare', notes: 'Rewrites on prepare; appends on --add' },
  { file: 'notes.md', createdBy: '(you)', notes: 'Your notes — tool never reads or writes' },
];

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
  const rows = FILE_TABLE.filter((entry) => fileSet.has(entry.file));

  if (rows.length === 0) {
    return;
  }

  const table = new Table({
    style: { head: [], border: [] },
    wordWrap: true,
  });

  table.push([dim('File'), dim('Created by'), dim('Notes')]);
  for (const entry of rows) {
    table.push([green(entry.file), cyan(entry.createdBy), entry.notes]);
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
  .option('--json', 'output as JSON');

showCommand.option('--jd', 'show job description');

showCommand.action(async function (slug: string | undefined) {
  const globals = this.parent?.opts() as GlobalOpts | undefined;
  const campaign = await resolveCampaignCli(globals);
  const log = getRootLogger().child({ cmd: 'show', campaign });
  const opts = this.opts() as { json?: boolean; jd?: boolean };

  try {
    const resolvedSlug = resolveSlug(slug, campaign);
    const appliedDir = resolveAppliedDir(resolveCampaignRoot(campaign));

    const data = await readShowData(appliedDir, resolvedSlug);

    const showJd = opts.jd === true;

    if (opts.json) {
      const json: Record<string, unknown> = { ...data.frontmatter, files: data.filesPresent };
      if (showJd) {
        try {
          const content = await readShowFile(appliedDir, resolvedSlug, 'jd.md');
          json['jd.md'] = content;
        } catch {
          log.warn({ slug: resolvedSlug }, 'show.jd-missing');
        }
      }
      userOutput(JSON.stringify(json, null, 2));
    } else {
      renderSummary(data);
      if (showJd) {
        try {
          const content = await readShowFile(appliedDir, resolvedSlug, 'jd.md');
          userOutput(`\n${cyan('job description')}\n${'─'.repeat(16)}\n${content}`);
        } catch {
          log.warn({ slug: resolvedSlug }, 'show.jd-missing');
          userError('jd.md not found');
        }
      } else {
        renderFileTable(data.filesPresent);
      }
    }

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
Use --json for machine-readable output.

Use --jd to view the job description content directly after the summary.

Examples:
  $ jho show                                                  # infer slug from cwd
  $ jho show 2026-Jan-15-frontend-acme-12345                  # explicit slug
  $ jho show --json                                           # JSON output
  $ jho show --jd                                             # view job description
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho show    # infer from cwd
`,
);
