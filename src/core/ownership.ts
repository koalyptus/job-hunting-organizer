import Table from 'cli-table3';
import { resolveConfigHome, DEFAULT_CONFIG_FILENAME } from './paths.js';
import type { OwnershipRow, RenderOwnershipOptions } from './types.js';

// Static ownership table from AGENTS.md. Kept in code (not a doc) so that
// `jho ownership` always shows the same rules the tool actually enforces.
/**
 * The full ownership table, in display order. Each entry corresponds
 * to a row shown by `jho ownership` / `jho ownership --markdown`.
 * Source of truth: `AGENTS.md` "File ownership model" table.
 */
export const OWNERSHIP_ROWS: readonly OwnershipRow[] = [
  {
    file: 'meta.md (the metadata fields at the top)',
    toolWrites: 'yes (rewrites from the job ad + your current status)',
    editFreely: 'yes (add your own key:value lines)',
    onYourEdit: 'your extra fields are kept; the rest is rewritten',
  },
  {
    file: 'meta.md (everything below the metadata fields)',
    toolWrites: 'never',
    editFreely: 'yes',
    onYourEdit: 'kept exactly as you wrote it',
  },
  {
    file: 'jd.md (the auto-fetched job ad, at the top)',
    toolWrites: 'yes (replaces it when you re-run `jho track`)',
    editFreely: 'no (the tool owns this section)',
    onYourEdit: 'your edits are lost on the next `jho track`',
  },
  {
    file: 'jd.md (everything below the auto-fetched section)',
    toolWrites: 'never',
    editFreely: 'yes',
    onYourEdit: 'kept when you re-run `jho track`',
  },
  {
    file: 'cover-letter.md',
    toolWrites: 'when you re-run `jho cover-letter`',
    editFreely: 'yes',
    onYourEdit: 'asks before overwriting on the next regenerate',
  },
  {
    file: 'qa.md',
    toolWrites: 'appends new entries; never rewrites old ones',
    editFreely: 'yes',
    onYourEdit: 'older entries stay as you wrote them',
  },
  {
    file: 'interviews.md',
    toolWrites: 'appends new entries; updates the current status line',
    editFreely: 'yes (except the current status line)',
    onYourEdit: 'change the status with `jho interview mark`',
  },
  {
    file: 'retro.md',
    toolWrites: 'appends a new section per retro',
    editFreely: 'yes (your notes and checklists inside a section)',
    onYourEdit: 'older retro sections stay as you wrote them',
  },
  {
    file: 'prep.md',
    toolWrites: 'rewrites on `--update`; appends topics on `--add`',
    editFreely: 'yes',
    onYourEdit: 'asks before overwriting; your edits are kept unless you accept',
  },
  {
    file: 'profile.md (the "Target roles" section)',
    toolWrites: 'suggests roles on `jho campaign init` and `profile rebuild`',
    editFreely: 'yes (titles, fields, priority)',
    onYourEdit: 'asks before overwriting',
  },
  {
    file: 'notes.md',
    toolWrites: 'never',
    editFreely: 'yes',
    onYourEdit: 'this file is entirely yours — the tool never reads or writes it',
  },
  {
    file: 'applied/.index.json',
    toolWrites: 'regenerated when the tool reads it (to refresh the listing)',
    editFreely: 'no (the tool regenerates it; not for human editing)',
    onYourEdit: 'your edits are lost — it is regenerated automatically',
  },
  {
    file: 'applied/.counters.json',
    toolWrites: 'when two applications need the same folder name (so a -2, -3 suffix is added)',
    editFreely: 'no (the tool regenerates it; not for human editing)',
    onYourEdit: 'your edits are lost — it is regenerated automatically',
  },
];

/**
 * Render the ownership table for `jho ownership`. Default output is a
 * `cli-table3` console table sized to fit a 120-char terminal with
 * word-wrapping enabled. With `{ markdown: true }` the output is a
 * markdown table suitable for pasting into `AGENTS.md` or a PR.
 * @param options - Format and display overrides.
 * @returns The full rendered output, including a header comment.
 */
export function renderOwnership(options: RenderOwnershipOptions = {}): string {
  const useMd = options.markdown === true;
  const configPath = options.configPath ?? resolveConfigHome() + '/' + DEFAULT_CONFIG_FILENAME;
  const header = useMd
    ? `# File ownership\n\nThe tool follows the rules below. Source of truth: \`AGENTS.md\`. Global config: \`${configPath}\`.\n\n`
    : `File ownership — the tool follows these rules. Source of truth: AGENTS.md.

Global config: ${configPath}

`;
  return (
    header +
    (useMd
      ? formatMarkdownTable(OWNERSHIP_ROWS)
      : formatConsoleTable(OWNERSHIP_ROWS, options.colorize))
  );
}

/** Column headers for the ownership table (shared by both renderers). */
const COLUMNS: readonly string[] = ['File', 'Tool writes', 'Edit freely?', 'On your edit'];

/**
 * Default column widths, sized to fit comfortably in a 120-char terminal.
 * Content longer than the column width wraps to the next line (via
 * `cli-table3`'s `wordWrap: true`).
 */
const DEFAULT_COL_WIDTHS: readonly number[] = [30, 26, 20, 36];

/**
 * Render the ownership table as a `cli-table3` console table.
 * `head: []` and `border: []` disable ANSI styling so the output is
 * safe to pipe or redirect.
 * @param rows - The rows to render.
 * @returns The rendered table followed by a single newline.
 */
function formatConsoleTable(
  rows: readonly OwnershipRow[],
  colorize?: { bold: (text: string) => string; cyan: (text: string) => string },
): string {
  const b = colorize?.bold ?? ((s: string) => s);
  const c = colorize?.cyan ?? ((s: string) => s);
  const table = new Table({
    head: COLUMNS.map((h) => b(h)),
    wordWrap: true,
    colWidths: [...DEFAULT_COL_WIDTHS],
    style: { head: [], border: [] },
  });
  for (const r of rows) {
    table.push([c(r.file), r.toolWrites, r.editFreely, r.onYourEdit]);
  }
  return `${table.toString()}\n`;
}

/**
 * Render the ownership table as a GitHub-flavoured markdown table.
 * Column widths are computed from the widest cell; the separator line
 * uses three dashes per column (width is irrelevant in markdown).
 * @param rows - The rows to render.
 * @returns The rendered markdown table followed by a single newline.
 */
function formatMarkdownTable(rows: readonly OwnershipRow[]): string {
  const widths = [
    Math.max(COLUMNS[0]!.length, ...rows.map((r) => r.file.length)),
    Math.max(COLUMNS[1]!.length, ...rows.map((r) => r.toolWrites.length)),
    Math.max(COLUMNS[2]!.length, ...rows.map((r) => r.editFreely.length)),
    Math.max(COLUMNS[3]!.length, ...rows.map((r) => r.onYourEdit.length)),
  ];
  const pad = (s: string, n: number): string => s + ' '.repeat(Math.max(0, n - s.length));
  const lines: string[] = [];
  lines.push(`| ${COLUMNS.map((c, i) => pad(c, widths[i]!)).join(' | ')} |`);
  lines.push(`| ${widths.map(() => '---').join(' | ')} |`);
  for (const r of rows) {
    const cells = [r.file, r.toolWrites, r.editFreely, r.onYourEdit];
    lines.push(`| ${cells.map((c, i) => pad(c, widths[i]!)).join(' | ')} |`);
  }
  return `${lines.join('\n')}\n`;
}
