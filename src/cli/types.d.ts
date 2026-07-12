declare module 'marked-terminal' {
  import type { MarkedExtension } from 'marked';

  interface TerminalRendererOptions {
    tab?: number;
    showSectionPrefix?: boolean;
  }

  export function markedTerminal(options?: TerminalRendererOptions): MarkedExtension;
}
