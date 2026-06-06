import { getPackageVersion } from '../core/package.js';
import { resolveGlobalRoot, resolveCampaignRoot } from '../core/paths.js';

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

Commands (planned for v1):
  init [<name>]          Wizard: build profile from CV + GitHub; creates a new campaign
  config [show|path] [--global]  Show merged (or global-only) config; secrets redacted
  root [--global]        Print the inferred campaign root (or global root with --global)
  rename-campaign [<old>] <new>  Rename a campaign folder; bare \`mv\` also works
  profile [show|rebuild] Show or rebuild the profile
  track <url>            Record a new application
  list                   List all applications
  show [<slug>]          Show one application
  cover-letter [<slug>]  Generate a tailored cover letter
  answer [<slug>] "..."  Tailor an answer to an application question
  interview [<slug>]     Manage interview pipeline
  retro [<slug>]         Post-mortem for failed interviews
  prepare [<slug>]       Pre-interview prep plan
  ownership              What you can/can't edit
  doctor                 Diagnose the campaign
  repair                 Attempt auto-repair
  stats                  Campaign snapshot
  help [<cmd>|<topic>]   Show help for a command or topic
  mcp                    Start the MCP server

Per-command global flags (--campaign, --verbose, --quiet, --no-color, --log-file)
are planned for Phase 2c. Phase 2a ships only \`jho root\` and the help above.
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
    default:
      process.stderr.write(`jho: command not implemented yet: ${command} (planned: phase 4+)\n`);
      return 1;
  }
}

const exitCode = main(process.argv.slice(2));
process.exit(exitCode);
