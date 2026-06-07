import { getPackageVersion } from '../core/package.js';
import { resolveConfigHome, resolveCampaignRoot, resolveConfigPath } from '../core/paths.js';
import { loadGlobalConfig, loadCampaignConfig } from '../core/config.js';
import { redactSecrets } from '../core/config.view.js';
import { renderOwnership } from '../core/ownership.js';
import type { GlobalConfig, CampaignConfig, ParsedArgs } from '../core/types.js';

const VERSION = getPackageVersion();

/**
 * Internal helper. Writes the redacted body to stdout only. Run
 * `jho config path` (or `jho campaign config path`) separately if the
 * source path is needed — keeping the two streams separate makes
 * `jho config | jq` work cleanly with no extra flags.
 *
 * `reveal` opts out of secret redaction.
 */
function renderConfig(body: GlobalConfig | CampaignConfig, options: { reveal: boolean }): number {
  const value = options.reveal ? body : redactSecrets(body);
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  return 0;
}

/**
 * `jho --help` / `jho` (no args) — hand-written layered help. Lists every
 * command built in this phase (with a one-liner) and every command planned
 * for v1 (kept in sync with `AGENTS.md` until `jho help <cmd>` lands).
 */
function printHelp(): void {
  process.stdout.write(`jho ${VERSION} — local-first CLI for running a job-hunting campaign

Usage:
  jho [--version] [--help] <command> [args]

Options:
  --version              Print version and exit
  --help                 Print this help and exit

Data locations (override via env var only):
  $JHO_CONFIG_HOME       Override the global config home (default: ~/.job-hunting-organizer/)
                         No --config-home flag by design — matches git, VS Code, ssh conventions.
  $JHO_DATA              Override the campaign data root (default: ~/job-hunting-organizer-data/)
                         No --data-root flag by design.

Commands available in this build:
  config [show|path]     Show or print the path of the global config (in the config home)
  campaign config [show|path]
                         Show or print the path of the active campaign's config
                         (in <data-root>/campaigns/<name>/)
  ownership              Print the file ownership table

Commands planned for v1 (not yet implemented):
  campaign init [<name>]      Wizard: build profile from CV + GitHub; creates a new campaign
  campaign rename [<old>] <new>  Rename a campaign folder (or \`mv\` the folder directly)
  campaign doctor              Diagnose the campaign
  campaign repair              Attempt auto-repair
  campaign stats               Campaign snapshot
  profile [show|rebuild]       Show or rebuild the profile
  track <url>                  Record a new application
  list                         List all applications
  show [<slug>]                Show one application
  cover-letter [<slug>]        Generate a tailored cover letter
  answer [<slug>] "..."        Tailor an answer to an application question
  interview [<slug>]           Manage interview pipeline
  retro [<slug>]               Post-mortem for failed interviews
  prepare [<slug>]             Pre-interview prep plan
  help [<cmd>|<topic>]         Show help for a command or topic
  mcp                          Start the MCP server

Per-command global flags (--campaign, --verbose, --quiet, --no-color, --log-file)
are planned for Phase 2c.
`);
}

/**
 * `jho --version` — single-line version stamp. Kept separate from `printHelp`
 * so `jho --version | head` works (help is multi-line and intentionally
 * human-shaped).
 */
function printVersion(): void {
  process.stdout.write(`${VERSION}\n`);
}

/**
 * Pull `--version` / `--help` off the front of argv and return the rest
 * as `{ command, rest }`. Intentionally minimal — once `commander` lands
 * in Phase 2c this function goes away.
 */
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

/**
 * `jho config [show|path]` — show or print the path of the global config
 * (in the config home). `show` accepts `--reveal`; `path` is a one-liner
 * intended for `$(jho config path)`.
 */
function commandConfig(args: readonly string[]): number {
  // Tolerate `jho config --reveal` (flag before the subcommand) by treating
  // it as `show --reveal`. Other flags are passed through to the switch
  // so `--help` / `-h` still reach their own cases.
  const normalized: readonly string[] = args[0] === '--reveal' ? ['show', ...args] : args;
  const sub = normalized[0] ?? 'show';
  switch (sub) {
    case 'show': {
      const reveal = normalized.includes('--reveal');
      return renderConfig(loadGlobalConfig(), { reveal });
    }
    case 'path': {
      process.stdout.write(`${resolveConfigPath(resolveConfigHome())}\n`);
      return 0;
    }
    case '--help':
    case '-h':
      process.stdout.write(
        `jho config — show or print the path of the global config

Usage:
  jho config show [--reveal]
  jho config path

Options:
  --reveal   Show secrets in clear text (default: redact)

The global config lives in the config home ($JHO_CONFIG_HOME, default
~/.job-hunting-organizer/). For the active campaign's config, use
\`jho campaign config\`. The source path is always available via
\`jho config path\` — output is the config body on stdout only, so
\`jho config | jq\` works without a flag.

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

/**
 * `jho campaign config` — show or print the path of the active campaign's
 * config (in the data root). Mirrors `jho config` for symmetry; uses the
 * `default` campaign until `--campaign` lands in Phase 2c.
 */
function commandCampaignConfig(args: readonly string[]): number {
  // Tolerate `jho campaign config --reveal` (flag before the subcommand) by
  // treating it as `show --reveal`. Other flags are passed through to the
  // switch so `--help` / `-h` still reach their own cases.
  const normalized: readonly string[] = args[0] === '--reveal' ? ['show', ...args] : args;
  const sub = normalized[0] ?? 'show';
  switch (sub) {
    case 'show': {
      const reveal = normalized.includes('--reveal');
      return renderConfig(loadCampaignConfig('default'), { reveal });
    }
    case 'path': {
      process.stdout.write(`${resolveConfigPath(resolveCampaignRoot('default'))}\n`);
      return 0;
    }
    case '--help':
    case '-h':
      process.stdout.write(
        `jho campaign config — show or print the path of the active campaign's config

Usage:
  jho campaign config show [--reveal]
  jho campaign config path

Options:
  --reveal   Show secrets in clear text (default: redact)

The campaign config lives in <data-root>/campaigns/<name>/config.json
($JHO_DATA, default ~/job-hunting-organizer-data/). For the global config,
use \`jho config\`. The source path is always available via
\`jho campaign config path\` — output is the config body on stdout only,
so \`jho campaign config | jq\` works without a flag. (Per-campaign
selection via --campaign is planned for Phase 2c.)
`,
      );
      return 0;
    default:
      process.stderr.write(`jho campaign config: unknown subcommand: ${sub}\n`);
      return 1;
  }
}

/**
 * `jho campaign <subcommand>` — dispatch campaign-scoped operations.
 * Currently wires `config`; future subcommands (`init`, `rename`,
 * `doctor`, `repair`, `stats`) slot into the same switch when they
 * land.
 */
function commandCampaign(args: readonly string[]): number {
  const sub = args[0];
  switch (sub) {
    case 'config':
      return commandCampaignConfig(args.slice(1));
    case '--help':
    case '-h':
    case undefined:
      process.stdout.write(
        `jho campaign — operations on a campaign

Usage:
  jho campaign config [show|path]
  jho campaign <subcommand> [...]

Available subcommands (current build):
  config          Show or print the path of the active campaign's config

Available subcommands (planned for v1, not yet implemented):
  init [<name>]            Wizard: build profile from CV + GitHub; creates a new campaign
  rename [<old>] <new>     Rename a campaign folder (or \`mv\` the folder directly)
  doctor                   Diagnose the campaign
  repair                   Attempt auto-repair
  stats                    Campaign snapshot
`,
      );
      return 0;
    default:
      process.stderr.write(
        `jho campaign: unknown subcommand: ${sub}. See \`jho campaign --help\` for the full list (built and planned).\n`,
      );
      return 1;
  }
}

/**
 * `jho ownership` — print the file ownership table (consumed by humans and
 * embedded in `AGENTS.md`). `--markdown` switches to a copy-paste-ready
 * Markdown table for docs / issues.
 */
function commandOwnership(args: readonly string[]): number {
  const asMarkdown = args.includes('--markdown');
  process.stdout.write(renderOwnership({ markdown: asMarkdown }));
  return 0;
}

/**
 * Entry point: parses argv, dispatches to the right command, returns the
 * process exit code. Stdout = command output; stderr = source-path hints
 * and errors. Side-effecting writes only happen inside dispatched commands.
 */
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
    case 'config':
      return commandConfig(rest);
    case 'campaign':
      return commandCampaign(rest);
    case 'ownership':
      return commandOwnership(rest);
    default:
      process.stderr.write(
        `jho: unknown command: ${command}. See \`jho --help\` for the full list (built and planned).\n`,
      );
      return 1;
  }
}

const exitCode = main(process.argv.slice(2));
process.exit(exitCode);
