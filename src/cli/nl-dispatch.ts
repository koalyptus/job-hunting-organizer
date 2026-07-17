import type { Command } from 'commander';
import type { GlobalOpts } from './options.js';
import { PromptParseError, deriveKnownCommands } from '../core/parser/prompt-parser.js';
import type { ParsedCommand } from '../core/parser/prompt-parser.js';
import { getRootLogger } from '../core/logger/logger.js';
import { resolveCampaign } from './campaign.js';
import type { Logger } from 'pino';

/**
 * Derive the set of valid command names from a Commander program.
 * This stays in sync with registered commands automatically.
 */
function getValidCommands(program: Command): Set<string> {
  return deriveKnownCommands(program.commands.map((c) => c.name()));
}

/**
 * Derive the set of commands that accept subcommands from a Commander program.
 */
function getCommandsWithSubcommands(program: Command): Set<string> {
  return new Set(program.commands.filter((c) => c.commands.length > 0).map((c) => c.name()));
}

/**
 * Validate a parsed command against the registered Commander program.
 * Throws {@link PromptParseError} if the command or subcommand is invalid.
 *
 * @param parsed - The parsed command from the LLM
 * @param program - The fully-configured Commander program
 * @param rawOutput - Raw LLM output for error context
 */
export function validateParsedCommand(
  parsed: ParsedCommand,
  program: Command,
  rawOutput?: string,
): void {
  const log = getRootLogger().child({ module: 'nl-dispatch' });
  const validCommands = getValidCommands(program);
  const commandsWithSubs = getCommandsWithSubcommands(program);

  if (!validCommands.has(parsed.command)) {
    log.warn({ command: parsed.command }, 'nl-dispatch.unknown-command');
    throw new PromptParseError(`Unknown command: ${parsed.command}`, rawOutput);
  }

  if (parsed.subcommand && !commandsWithSubs.has(parsed.command)) {
    log.warn(
      { command: parsed.command, subcommand: parsed.subcommand },
      'nl-dispatch.invalid-subcommand',
    );
    throw new PromptParseError(
      `Command "${parsed.command}" does not accept subcommands`,
      rawOutput,
    );
  }
}

/**
 * Build a synthetic argv array from a parsed natural language command, then
 * re-parse it through the existing Commander program. This reuses all existing
 * CLI command logic verbatim — no business logic is duplicated here.
 *
 * @param parsed - The parsed command from {@link parseNaturalLanguage}
 * @param globals - Global CLI options (--campaign, --verbose, etc.)
 * @param program - The fully-configured Commander program (with all commands registered)
 * @returns The result of `program.parseAsync`
 */
export async function dispatchNaturalLanguage(
  parsed: ParsedCommand,
  globals: GlobalOpts,
  program: Command,
  log?: Logger,
): Promise<void> {
  const logger = log ?? getRootLogger().child({ cmd: parsed.command, module: 'nl-dispatch' });

  // Merge global options from the LLM's parsed output into the globals object.
  // The LLM may extract campaign, verbose, yes, etc. from the NL input — these
  // were never CLI flags, so they live in parsed.options, not in globals.
  const mergedGlobals = { ...globals };
  for (const key of Object.keys(parsed.options)) {
    if (isGlobalOption(key) && key in mergedGlobals === false) {
      const val = parsed.options[key];
      if (val !== undefined && val !== null) {
        (mergedGlobals as Record<string, unknown>)[key] = val;
      }
    }
  }

  // When the user asks to list/filter applications but omits the campaign,
  // prompt for one instead of silently showing the campaign list.
  const shouldPromptForCampaign =
    parsed.command === 'list' &&
    !mergedGlobals.campaign &&
    (parsed.options.status !== undefined ||
      parsed.options.tag !== undefined ||
      parsed.options.role !== undefined ||
      parsed.options.employmentType !== undefined);
  if (shouldPromptForCampaign) {
    // Pass only the CLI-provided `yes` flag (not an LLM-inferred one) so the
    // campaign picker still prompts when the user didn't explicitly skip it.
    mergedGlobals.campaign = await resolveCampaign({
      ...globals,
      yes: globals.yes ?? false,
      campaign: mergedGlobals.campaign,
    } as GlobalOpts);
  }

  const argv = buildArgv(parsed, mergedGlobals);
  logger.info({ argv }, 'nl-dispatch.argv');

  // Reset any prior parse state and parse the synthetic argv.
  // Commander mutates internal state across parses, so we re-create via a
  // fresh parse of the already-registered program.
  try {
    await program.parseAsync(argv, { from: 'user' });
  } catch (err) {
    // Commander throws a CommanderError with code 'commander.help' and
    // exitCode 0 when a help command is executed. This is normal behavior -
    // the help was displayed, we should just exit cleanly.
    if (err && typeof err === 'object' && 'code' in err && err.code === 'commander.help') {
      // Help was shown, exit successfully
      process.exit(0);
    }
    throw err;
  }
}

/**
 * Convert a {@link ParsedCommand} plus global options into a CLI argv array
 * that the existing Commander program understands.
 *
 * @param parsed - The parsed command
 * @param globals - Global CLI options
 * @returns argv array (excluding `node` and script path)
 */
function buildArgv(parsed: ParsedCommand, globals: GlobalOpts): string[] {
  const argv: string[] = [];

  // Global options first
  if (globals.campaign !== undefined) {
    argv.push('--campaign', globals.campaign);
  }
  if (globals.verbose) {
    argv.push('--verbose');
  }
  if (globals.quiet) {
    argv.push('--quiet');
  }
  if (globals.yes) {
    argv.push('--yes');
  }
  if (globals.color === false) {
    argv.push('--no-color');
  }
  if (globals.logFile !== undefined) {
    argv.push('--log-file', globals.logFile);
  }

  // Main command
  argv.push(parsed.command);

  // Subcommand (for commands that have them)
  if (parsed.subcommand !== undefined) {
    argv.push(parsed.subcommand);
  }

  // Positional args
  for (const arg of parsed.args) {
    argv.push(arg);
  }

  // Command options
  for (const [key, value] of Object.entries(parsed.options)) {
    // Skip options already handled as globals
    if (isGlobalOption(key)) {
      continue;
    }
    appendOption(argv, key, value);
  }

  return argv;
}

/**
 * Check if an option key is a global option (handled separately).
 */
function isGlobalOption(key: string): boolean {
  return ['campaign', 'verbose', 'quiet', 'yes', 'color', 'logFile'].includes(key);
}

/**
 * Append an option to the argv array in the correct CLI format.
 *
 * @param argv - The argv array to append to
 * @param key - The option key (camelCase, e.g. "status")
 * @param value - The option value (string, number, boolean, array)
 */
function appendOption(argv: string[], key: string, value: unknown): void {
  // Convert camelCase to kebab-case
  const flag = `--${key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;

  if (value === true) {
    argv.push(flag);
  } else if (value === false || value === undefined || value === null) {
    // Skip false/undefined options
    return;
  } else if (Array.isArray(value)) {
    for (const item of value) {
      argv.push(flag, String(item));
    }
  } else {
    argv.push(flag, String(value));
  }
}
