import { getPackageVersion } from '../core/package.js';
import { resolveRoot } from '../core/paths.js';

const VERSION = getPackageVersion();

function printHelp(): void {
  const out = process.stdout;
  out.write(`jho ${VERSION} — local-first CLI for running a job-hunting campaign

Usage:
  jho [--version] [--help] [-v | --verbose] [-q | --quiet] [--no-color]
      [--log-file <path>] [--root <path>] <command> [args]

Global options:
  --version              Print version and exit
  --help                 Print this help and exit
  -v, --verbose          Increase log verbosity
  -q, --quiet            Decrease log verbosity
  --no-color             Disable coloured output
  --log-file <path>      Write logs to <path> in addition to stderr
  --root <path>          Override campaign root (default: $JHO_ROOT or ~/job-hunting-organizer)

Commands (planned for v1):
  init                   Wizard: build profile from CV + GitHub
  config [show|path]     Show or print global config (secrets redacted)
  root                   Print the resolved campaign root
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

Phase 2 ships only \`jho root\`. All other commands will surface
"not implemented yet (planned: phase N)" until their phase lands.
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

function commandRoot(): void {
  const root = resolveRoot();
  process.stdout.write(`${root}\n`);
}

function main(argv: readonly string[]): number {
  const { command, showVersion, showHelp } = parseArgs(argv);

  if (showVersion) {
    printVersion();
    return 0;
  }
  if (showHelp || command === null || command === 'help') {
    if (command === 'help') {
      // subcommand help isn't wired in 2a
      process.stderr.write('jho help: per-command help is planned for Phase 2c\n');
      return 1;
    }
    printHelp();
    return 0;
  }

  switch (command) {
    case 'root':
      commandRoot();
      return 0;
    default:
      process.stderr.write(`jho: command not implemented yet: ${command} (planned: phase 4+)\n`);
      return 1;
  }
}

const exitCode = main(process.argv.slice(2));
process.exit(exitCode);
