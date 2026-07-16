import { defaultLlmConfig, chatComplete, parseJsonResult } from '../llm.js';
import { loadPromptTemplate } from '../prompts.js';
import { getRootLogger } from '../logger/logger.js';
import { SLUG_PATTERN } from './slug.js';
import type { Logger } from 'pino';
import type { GlobalOpts } from '../types.js';

/**
 * Plain-data description of global CLI flags. Defined in core so the
 * NL parser can use it without depending on Commander. The CLI layer
 * uses this to build Commander `Option` instances.
 */
export const GLOBAL_FLAG_DEFS: ReadonlyArray<{
  readonly long: string;
  readonly short?: string;
  readonly takesValue: boolean;
  readonly negate: boolean;
}> = [
  { long: 'campaign', short: undefined, takesValue: true, negate: false },
  { long: 'verbose', short: 'v', takesValue: false, negate: false },
  { long: 'quiet', short: 'q', takesValue: false, negate: false },
  { long: 'yes', short: 'y', takesValue: false, negate: false },
  { long: 'color', short: undefined, takesValue: false, negate: true },
  { long: 'log-file', short: undefined, takesValue: true, negate: false },
];

/**
 * Parsed command structure returned by the natural language parser.
 */
export interface ParsedCommand {
  /** The main command to execute (e.g., "list", "track", "cover-letter") */
  command: string;
  /** Optional subcommand for commands that have them (e.g., "add" for interview) */
  subcommand?: string;
  /** Positional arguments (URLs, slugs, names, etc.) */
  args: string[];
  /** Command options including global options (--campaign, --json, etc.) */
  options: Record<string, unknown>;
  /** Confidence score 0-1 */
  confidence: number;
}

/**
 * Fallback set of known command names used by {@link looksLikeNaturalLanguage}
 * only when no live command set is supplied by the caller. This mirrors the
 * commands registered in the CLI; it is intentionally a *fallback* so the
 * heuristic still works for direct/test callers. The CLI layer should always
 * pass the authoritative set derived from the registered Commander program
 * (see {@link deriveKnownCommands}) so the two never drift.
 */
const FALLBACK_KNOWN_COMMANDS = new Set([
  'list',
  'track',
  'show',
  'cover-letter',
  'answer',
  'interview',
  'retro',
  'prepare',
  'profile',
  'stats',
  'doctor',
  'repair',
  'logs',
  'campaign',
  'config',
  'help',
  'init',
  'rename-campaign',
  'remove-campaign',
  'rename-application',
  'remove-application',
  'ownership',
  'mcp',
  'campaign-config',
]);

/**
 * Error thrown when natural language parsing fails.
 */
export class PromptParseError extends Error {
  constructor(
    message: string,
    public readonly rawOutput?: string,
  ) {
    super(message);
    this.name = 'PromptParseError';
  }
}

/**
 * Parse natural language input into a structured command.
 *
 * @param input - The natural language input from the user
 * @param globals - Global CLI options already parsed (--campaign, --verbose, etc.)
 * @param log - Optional logger instance
 * @returns Parsed command structure
 * @throws {PromptParseError} If parsing fails or returns invalid structure
 */
export async function parseNaturalLanguage(
  input: string,
  globals: GlobalOpts,
  log?: Logger,
): Promise<ParsedCommand> {
  const logger = log ?? getRootLogger().child({ module: 'prompt-parser' });

  const llmConfig = defaultLlmConfig();
  const { body: systemPrompt } = await loadPromptTemplate('nl-command');

  const userMessage = `User input: "${input}"\n\nGlobal options parsed from CLI: ${JSON.stringify(globals)}`;

  logger.debug({ input, globals }, 'prompt-parser.start');

  let result;
  try {
    result = await chatComplete(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      llmConfig,
      { jsonMode: true, temperature: 0.1 },
      logger,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ error: msg }, 'prompt-parser.llm-failed');
    const isTimeout = /timed?\s*out/i.test(msg);
    const hint = isTimeout
      ? ' — the LLM request timed out. Increase llm.timeoutMs in config.json, or use a faster model.'
      : '';
    throw new PromptParseError(`LLM call failed: ${msg}${hint}`);
  }

  logger.info(
    { model: llmConfig.model, tokens: result.usage.totalTokens },
    'prompt-parser.llm.completed',
  );

  let parsed: ParsedCommand;
  try {
    parsed = parseJsonResult<ParsedCommand>(result.content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ raw: result.content, error: msg }, 'prompt-parser.json-parse-failed');
    throw new PromptParseError(`Failed to parse LLM response as JSON: ${msg}`, result.content);
  }

  // Validate required fields
  if (!parsed.command || typeof parsed.command !== 'string') {
    throw new PromptParseError('Missing or invalid "command" field', result.content);
  }
  if (!Array.isArray(parsed.args)) {
    throw new PromptParseError('Missing or invalid "args" field (must be array)', result.content);
  }
  if (parsed.options === null || typeof parsed.options !== 'object') {
    throw new PromptParseError(
      'Missing or invalid "options" field (must be object)',
      result.content,
    );
  }
  if (typeof parsed.confidence !== 'number') {
    parsed.confidence = 0.5;
  }

  // Merge explicit CLI globals over LLM-parsed options.
  // Explicit flags always win (e.g. `jho --campaign foo "list apps"` overrides LLM's campaign).
  for (const [key, value] of Object.entries(globals)) {
    if (value !== undefined) {
      (parsed.options as Record<string, unknown>)[key] = value;
    }
  }

  // Clamp confidence to valid range
  parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));

  logger.info(
    {
      command: parsed.command,
      subcommand: parsed.subcommand,
      args: parsed.args,
      confidence: parsed.confidence,
    },
    'prompt-parser.parsed',
  );

  return parsed;
}

/**
 * Build the set of known command names from a list of command names.
 *
 * This is a commander-agnostic helper: the CLI layer passes
 * `program.commands.map((c) => c.name())` (plus any aliases it cares about)
 * so the heuristic stays in sync with the actually-registered commands
 * without `core` importing Commander.
 *
 * @param commandNames - The names of all registered commands
 * @returns A set of known command names
 */
export function deriveKnownCommands(commandNames: ReadonlyArray<string>): Set<string> {
  return new Set(commandNames);
}

/**
 * Check if a string looks like a natural language prompt (vs a regular CLI command).
 *
 * @param args - Raw command line arguments
 * @param knownCommands - The authoritative set of registered command names.
 *   When omitted, {@link FALLBACK_KNOWN_COMMANDS} is used (testing / direct callers).
 *   The CLI layer should pass the live set via {@link deriveKnownCommands} so the
 *   heuristic never drifts from the real command registry.
 * @returns True if the first argument appears to be natural language
 */
export function looksLikeNaturalLanguage(
  args: string[],
  knownCommands: ReadonlySet<string> = FALLBACK_KNOWN_COMMANDS,
): boolean {
  if (args.length === 0) {
    return false;
  }

  const firstArg = args[0];
  if (firstArg === undefined) {
    return false;
  }

  // If it starts with a dash, it's a flag/option
  if (firstArg.startsWith('-')) {
    return false;
  }

  // If it matches a known command exactly, it's not natural language
  if (knownCommands.has(firstArg)) {
    return false;
  }

  // If it contains spaces, it's likely natural language.
  // Exception: "<known_command> <slug>" (e.g. `show 2026-Jan-15-...`) is a
  // legitimate quoted command invocation, not natural language. We detect the
  // slug via the same pattern used for cwd inference.
  if (firstArg.includes(' ')) {
    const parts = firstArg.split(' ');
    const firstWord = parts[0] ?? '';
    const secondWord = parts[1] ?? '';
    if (knownCommands.has(firstWord) && SLUG_PATTERN.test(secondWord)) {
      return false;
    }
    return true;
  }

  // Single word that's not a known command - could be a slug or natural language
  // We'll let Commander handle slugs, so treat as not natural language
  return false;
}

/**
 * Lookup table built from {@link GLOBAL_FLAG_DEFS} at module load time.
 * Maps each flag string (e.g. `--campaign`, `-v`) to metadata about the option.
 */
const GLOBAL_FLAG_MAP = new Map<
  string,
  { long: string; longCamel: string; takesValue: boolean; negate: boolean }
>();
for (const def of GLOBAL_FLAG_DEFS) {
  // Convert kebab-case to camelCase for the GlobalOpts interface (e.g. "log-file" → "logFile")
  // Special case: negate flags strip the "no-" prefix (e.g. "no-color" → "color")
  const camelName = def.negate
    ? def.long.replace(/^no-/, '').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    : def.long.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  const entry = {
    long: def.long,
    longCamel: camelName,
    takesValue: def.takesValue,
    negate: def.negate,
  };
  if (def.short) {
    GLOBAL_FLAG_MAP.set(`-${def.short}`, entry);
  }
  // Negate flags use "no-" prefix in the flag string (e.g. --no-color)
  const flagKey = def.negate ? `--no-${def.long}` : `--${def.long}`;
  GLOBAL_FLAG_MAP.set(flagKey, entry);
}

/**
 * Extract the natural language prompt from args, separating global options.
 *
 * The extraction is driven by {@link GLOBAL_FLAG_DEFS},
 * so new global flags are handled automatically without updating this function.
 *
 * @param args - Raw command line arguments
 * @returns Object with globals object and the prompt string
 */
export function extractPromptAndGlobals(args: string[]): { globals: GlobalOpts; prompt: string } {
  const globals: GlobalOpts = {};
  const promptParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }

    const entry = GLOBAL_FLAG_MAP.get(arg);
    if (entry === undefined) {
      // Not a global flag — part of the prompt
      promptParts.push(arg);
      continue;
    }

    if (entry.takesValue) {
      const nextArg = args[i + 1];
      if (nextArg !== undefined && !nextArg.startsWith('-')) {
        (globals as Record<string, unknown>)[entry.longCamel] = nextArg;
        i++; // Skip the value arg
      }
    } else if (entry.negate) {
      // Negate flag (e.g. --no-color → color: false)
      (globals as Record<string, unknown>)[entry.longCamel] = false;
    } else {
      // Boolean flag
      (globals as Record<string, unknown>)[entry.longCamel] = true;
    }
  }

  return { globals, prompt: promptParts.join(' ') };
}
