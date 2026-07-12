import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

/**
 * Configure marked with terminal-friendly rendering.
 *
 * Headings: bold cyan, bullets: green, code spans: yellow, links: blue.
 * Respects `NO_COLOR` via the existing `initColors()` integration in
 * `src/cli/colors.ts` which sets `chalk.level = 0` when disabled.
 */
marked.use(
  markedTerminal({
    tab: 4,
    showSectionPrefix: false,
  }),
);

/**
 * Render markdown content for terminal display.
 *
 * Converts markdown syntax into styled ANSI output suitable for human
 * consumption in the terminal. Use `--json` for raw markdown (machine
 * consumption).
 *
 * @param content - Raw markdown string to render.
 * @returns Rendered string with ANSI styling.
 */
export function renderMarkdown(content: string): string {
  return marked.parse(content) as string;
}
