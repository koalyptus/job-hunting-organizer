import { Option } from 'commander';

/**
 * Global options shared by every command. Added to the parent
 * `commander.program` so they're available on all subcommands.
 */
export const globalOptions = [
  new Option('--campaign <name>', 'campaign to operate on (default: cwd-inferred or "default")'),
  new Option('-v, --verbose', 'enable debug logging'),
  new Option('-q, --quiet', 'suppress info output (warn/error only)'),
  new Option('-y, --yes', 'skip confirmation prompts (use defaults)'),
  new Option('--no-color', 'disable colored output'),
  new Option('--log-file <path>', 'write logs to a file'),
];

/**
 * Parsed global options available on every command via
 * `optsWithGlobals()`. Commander stores these on the parent program.
 */
export interface GlobalOpts {
  campaign?: string;
  verbose?: boolean;
  quiet?: boolean;
  yes?: boolean;
  color?: boolean;
  logFile?: string;
}
