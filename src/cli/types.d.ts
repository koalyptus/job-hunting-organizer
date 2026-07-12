interface TerminalRendererOptions {
  tab?: number;
  showSectionPrefix?: boolean;
}

declare module 'marked-terminal' {
  import type { MarkedExtension } from 'marked';

  export function markedTerminal(options?: TerminalRendererOptions): MarkedExtension;
}
