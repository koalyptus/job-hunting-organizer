import { getPackageVersion } from '../core/package.js';
import { resolveGlobalRoot, resolveCampaignRoot } from '../core/paths.js';
import { configShowPaths, formatPathHint, renderConfigShow } from '../core/config.view.js';
import { renderOwnership } from '../core/ownership.js';

const VERSION = getPackageVersion();

function printHelp(): void {
  const out = process.stdout;
  out.write(`jho ${VERSION} — local-first CLI for running a job-hunting campaign

Usage:
  jho [--version] [--help] <command> [args]

Options:
  --version              Print version and exit
  --help                 Print this help and exit

Global root (override via env var only):
  $JHO_ROOT              Override the global data root (default: ~/job-hunting-organizer/)
                         No --global-root flag by design — matches git, VS Code, ssh config conventions.

Commands available in this build:
  root [--global]        Print the inferred campaign root (or global root with --global)
  config [show|path]     Show merged config; print the config path
  ownership              Print the file ownership table

Commands planned for v1 (not yet implemented):
  init [<name>]          Wizard: build profile from CV + GitHub; creates a new campaign
  profile [show|rebuild] Show or rebuild the profile
  track <url>            Record a new application
  list                   List all applications
  show [<slug>]          Show one application
  cover-letter [<slug>]  Generate a tailored cover letter
  answer [<slug>] "..."  Tailor an answer to an application question
  interview [<slug>]     Manage interview pipeline
  retro [<slug>]         Post-mortem for failed interviews
  prepare [<slug>]       Pre-interview prep plan
  doctor                 Diagnose the campaign
  repair                 Attempt auto-repair
  stats                  Campaign snapshot
  rename-campaign        Rename a campaign folder
  help [<cmd>|<topic>]   Show help for a command or topic
  mcp                    Start the MCP server

Per-command global flags (--campaign, --verbose, --quiet, --no-color, --log-file)
are planned for Phase 2c.
`);
}

function printVersion(): void {
  process.stdout.write(`${VERSION}\n`);
}

interface ParsedArgs {
  readonly command: string | null;
  readonly rest: readonly string[];
  readonly showVersion: boolean;
  readonly showHelp: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const args = [...argv];
  let showVersion = false;
  let showHelp = false;
  while (args.length > 0) {
    const a = args[0];
    if (a === '--version') {
      showVersion = true;
      args.shift();
    } else if (a === '--help' || a === '-h') {
      showHelp = true;
      args.shift();
    } else {
      break;
    }
  }
  const command = args.shift() ?? null;
  return { command, rest: args, showVersion, showHelp };
}

function commandRoot(args: readonly string[]): void {
  const isGlobal = args.includes('--global');
  const root = isGlobal ? resolveGlobalRoot() : resolveCampaignRoot();
  process.stdout.write(`${root}\n`);
}

function commandConfig(args: readonly string[]): number {
  // Tolerate `jho config --json` (flags before the subcommand) by treating
  // a flag as `show` with the rest of the args forwarded.
  const normalized: readonly string[] =
    args.length > 0 && (args[0] ?? '').startsWith('--') ? ['show', ...args] : args;
  const sub = normalized[0] ?? 'show';
  switch (sub) {
    case 'show': {
      const opts = {
        global: normalized.includes('--global'),
        reveal: normalized.includes('--reveal'),
        json: normalized.includes('--json'),
      };
      // Print the source path(s) to stderr so stdout stays clean for piping
      // (e.g. `jho config show --json | jq`). The non-JSON renderer also
      // embeds the path in its header comment for users who copy-paste output.
      process.stderr.write(formatPathHint(configShowPaths(opts)));
      process.stdout.write(renderConfigShow(opts));
      return 0;
    }
    case 'path': {
      const isGlobal = normalized.includes('--global');
      const p = isGlobal
        ? `${resolveGlobalRoot()}/config.json`
        : `${resolveCampaignRoot()}/config.json`;
      process.stdout.write(`${p}\n`);
      return 0;
    }
    case '--help':
    case '-h':
      process.stdout.write(
        `jho config — show the merged or global config

Usage:
  jho config show [--global] [--reveal] [--json]
  jho config path [--global]

Options:
  --global   Show the global config only (default: merged global + active campaign)
  --reveal   Show secrets in clear text (default: redact)
  --json     Output JSON only (default: header + pretty JSON)

Secrets redacted by default: llm.apiKey, github.token, calendar.outlook.clientSecret.
The redaction marker hints at the env var the user should set instead.
`,
      );
      return 0;
    default:
      process.stderr.write(`jho config: unknown subcommand: ${sub}\n`);
      return 1;
  }
}

function commandOwnership(args: readonly string[]): number {
  const asMarkdown = args.includes('--markdown');
  process.stdout.write(renderOwnership({ markdown: asMarkdown }));
  return 0;
}

function main(argv: readonly string[]): number {
  const { command, rest, showVersion, showHelp } = parseArgs(argv);

  if (showVersion) {
    printVersion();
    return 0;
  }
  if (command === 'help') {
    // subcommand help isn't wired in 2a
    process.stderr.write('jho help: per-command help is planned for Phase 2c\n');
    return 1;
  } else if (showHelp || command === null) {
    printHelp();
    return 0;
  }

  switch (command) {
    case 'root':
      commandRoot(rest);
      return 0;
    case 'config':
      return commandConfig(rest);
    case 'ownership':
      return commandOwnership(rest);
    default:
      process.stderr.write(`jho: command not implemented yet: ${command} (planned: phase 4+)\n`);
      return 1;
  }
}

const exitCode = main(process.argv.slice(2));
process.exit(exitCode);
