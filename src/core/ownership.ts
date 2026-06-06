import Table from 'cli-table3';
import { resolveGlobalRoot, DEFAULT_CONFIG_FILENAME } from './paths.js';

export interface OwnershipRow {
  readonly file: string;
  readonly toolWrites: string;
  readonly editFreely: string;
  readonly onYourEdit: string;
}

// Static ownership table from AGENTS.md. Kept in code (not a doc) so that
// `jho ownership` always shows the same rules the tool actually enforces.
export const OWNERSHIP_ROWS: readonly OwnershipRow[] = [
  {
    file: 'meta.md (frontmatter)',
    toolWrites: 'yes (rebuild from JD + state)',
    editFreely: 'yes (add custom fields)',
    onYourEdit: 'round-tripped, custom fields preserved',
  },
  {
    file: 'meta.md (body)',
    toolWrites: 'never',
    editFreely: 'yes',
    onYourEdit: 'preserved verbatim',
  },
  {
    file: 'jd.md (above jho:start:fetched-jd)',
    toolWrites: 'yes (on re-track)',
    editFreely: 'no (tool-managed region)',
    onYourEdit: 'overwritten',
  },
  {
    file: 'jd.md (below jho:end:fetched-jd)',
    toolWrites: 'never',
    editFreely: 'yes',
    onYourEdit: 'preserved on re-track',
  },
  {
    file: 'cover-letter.md',
    toolWrites: 'on regenerate',
    editFreely: 'yes',
    onYourEdit: 'prompts on next regenerate',
  },
  {
    file: 'qa.md',
    toolWrites: 'appends only',
    editFreely: 'yes',
    onYourEdit: 'prior entries untouched',
  },
  {
    file: 'interviews.md',
    toolWrites: 'appends; updates Status: line',
    editFreely: 'yes (except Status: line)',
    onYourEdit: 'mark status via `jho interview mark`',
  },
  {
    file: 'retro.md',
    toolWrites: 'appends new H2 sections',
    editFreely: 'yes (checklists, notes)',
    onYourEdit: 'prior retros untouched',
  },
  {
    file: 'prep.md',
    toolWrites: 'regenerates on --update; appends on --add',
    editFreely: 'yes',
    onYourEdit: 'prompts on overwrite; user edits preserved unless accepted',
  },
  {
    file: 'profile.md (## Target roles)',
    toolWrites: 'suggests on init / profile rebuild',
    editFreely: 'yes (titles, fields, priority)',
    onYourEdit: 'prompts before overwrite',
  },
  {
    file: 'notes.md',
    toolWrites: 'never',
    editFreely: 'yes',
    onYourEdit: 'never touched',
  },
  {
    file: 'applied/.index.json',
    toolWrites: 'on read / staleness',
    editFreely: 'no (internal cache)',
    onYourEdit: 'regenerated',
  },
  {
    file: 'applied/.counters.json',
    toolWrites: 'on slug collision',
    editFreely: 'no (internal cache)',
    onYourEdit: 'regenerated',
  },
];

export interface RenderOwnershipOptions {
  readonly markdown?: boolean;
  readonly configPath?: string;
}

export function renderOwnership(options: RenderOwnershipOptions = {}): string {
  const useMd = options.markdown === true;
  const configPath = options.configPath ?? resolveGlobalRoot() + '/' + DEFAULT_CONFIG_FILENAME;
  const header = useMd
    ? `# File ownership\n\nThe tool follows the rules below. Source of truth: \`AGENTS.md\`. Global config: \`${configPath}\`.\n\n`
    : `File ownership — the tool follows these rules. Source of truth: AGENTS.md.

Global config: ${configPath}

`;
  return (
    header + (useMd ? formatMarkdownTable(OWNERSHIP_ROWS) : formatConsoleTable(OWNERSHIP_ROWS))
  );
}

const COLUMNS: readonly string[] = ['File', 'Tool writes', 'Edit freely?', 'On your edit'];

// Default column widths, sized to fit comfortably in a 120-char terminal.
// Content longer than the column width wraps to the next line (wordWrap: true).
const DEFAULT_COL_WIDTHS: readonly number[] = [30, 26, 20, 36];

function formatConsoleTable(rows: readonly OwnershipRow[]): string {
  const table = new Table({
    head: [...COLUMNS],
    wordWrap: true,
    colWidths: [...DEFAULT_COL_WIDTHS],
    style: { head: [], border: [] },
  });
  for (const r of rows) {
    table.push([r.file, r.toolWrites, r.editFreely, r.onYourEdit]);
  }
  return `${table.toString()}\n`;
}

function formatMarkdownTable(rows: readonly OwnershipRow[]): string {
  const widths = [
    Math.max(COLUMNS[0]?.length ?? 0, ...rows.map((r) => r.file.length)),
    Math.max(COLUMNS[1]?.length ?? 0, ...rows.map((r) => r.toolWrites.length)),
    Math.max(COLUMNS[2]?.length ?? 0, ...rows.map((r) => r.editFreely.length)),
    Math.max(COLUMNS[3]?.length ?? 0, ...rows.map((r) => r.onYourEdit.length)),
  ];
  const pad = (s: string, n: number): string => s + ' '.repeat(Math.max(0, n - s.length));
  const lines: string[] = [];
  lines.push(`| ${COLUMNS.map((c, i) => pad(c, widths[i] ?? 0)).join(' | ')} |`);
  lines.push(`| ${widths.map(() => '---').join(' | ')} |`);
  for (const r of rows) {
    const cells = [r.file, r.toolWrites, r.editFreely, r.onYourEdit];
    lines.push(`| ${cells.map((c, i) => pad(c, widths[i] ?? 0)).join(' | ')} |`);
  }
  return `${lines.join('\n')}\n`;
}
