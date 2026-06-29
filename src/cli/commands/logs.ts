import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveConfigHome } from '../../core/paths.js';
import { getRootLogger, logError } from '../../core/logger/logger.js';
import { DEFAULT_LOG_FILENAME, FILTERABLE_LOG_LEVELS } from '../../core/types.js';
import { validateLevelOption, validateTailOption } from '../validate.js';
import { userError, userWarn, userOutput } from '../output.js';
// pino-pretty is a peer dep of pino. We use its prettyFactory to format
// individual JSON log lines for human reading.
import { prettyFactory } from 'pino-pretty';

/**
 * `jho logs` — pretty-print the log file.
 * The log file is always JSON (for tools); this command pipes it through
 * `pino-pretty` for human reading.
 */
export const logsCommand = new Command('logs')
  .description('Read the log file with human-readable formatting (pipes JSON through pino-pretty)')
  .option('--tail <n>', 'show only the last N lines')
  .option('--level <level>', `filter by minimum level (${FILTERABLE_LOG_LEVELS.join(', ')})`)
  .option('--json', 'output raw JSON lines instead of pretty-printing')
  .option('--path', 'print the log file path and exit')
  .action(async function (opts: { tail?: number; level?: string; json?: boolean; path?: boolean }) {
    const globals = this.parent?.opts() as { logFile?: string } | undefined;
    const log = getRootLogger().child({ cmd: 'logs' });

    const configHome = resolveConfigHome();
    const logFile = globals?.logFile ?? resolve(configHome, DEFAULT_LOG_FILENAME);

    if (opts.path) {
      userOutput(logFile);
      return;
    }

    if (!existsSync(logFile)) {
      log.warn({ file: logFile }, 'logs.file.missing');
      userWarn('No log file at ${logFile}\n(Run a command first.)');
      process.exit(1);
    }

    // Validate options
    if (opts.tail !== undefined) {
      const tailError = validateTailOption(String(opts.tail));
      if (tailError !== null) {
        const err = new Error(tailError);
        logError(log, err, 'logs.option.invalid', { option: 'tail', value: String(opts.tail) });
        userError(tailError);
        process.exit(1);
      }
    }

    if (opts.level !== undefined) {
      const levelError = validateLevelOption(opts.level);
      if (levelError !== null) {
        const err = new Error(levelError);
        logError(log, err, 'logs.option.invalid', { option: 'level', value: opts.level });
        userError(levelError);
        process.exit(1);
      }
    }

    const content = readFileSync(logFile, 'utf8');
    const allLines = content.split('\n').filter((line) => line.trim() !== '');

    // Apply --level filter (minimum level: include entries >= minLevel)
    let filteredLines = allLines;
    if (opts.level !== undefined) {
      const levelMap: Record<string, number> = {
        fatal: 60,
        error: 50,
        warn: 40,
        info: 30,
        debug: 20,
        trace: 10,
      };
      const minLevel = levelMap[opts.level.toLowerCase()] ?? 30;
      filteredLines = allLines.filter((line) => {
        try {
          const entry = JSON.parse(line) as { level?: number };
          return typeof entry.level === 'number' && entry.level >= minLevel;
        } catch {
          return false;
        }
      });
    }

    // Apply --tail
    const lines = opts.tail !== undefined ? filteredLines.slice(-opts.tail) : filteredLines;

    if (lines.length === 0) {
      log.debug({ file: logFile }, 'logs.printed.empty');
      return;
    }

    if (opts.json) {
      userOutput(lines.join('\n'));
      log.debug({ file: logFile, count: lines.length }, 'logs.printed.json');
      return;
    }

    // Use pino-pretty's prettyFactory to format each JSON line. This gives
    // us the exact same formatting as the console transport.
    const format = prettyFactory({
      colorize: true,
      translateTime: 'HH:MM:ss.l',
      ignore: 'pid,hostname',
      singleLine: false,
    });

    for (const line of lines) {
      const pretty = format(line);
      userOutput(pretty);
    }

    log.debug({ file: logFile, count: lines.length }, 'logs.printed');
  });

logsCommand.addHelpText(
  'after',
  `
The log file is always JSON (for tools like jq, grep, log aggregators).
This command pretty-prints it for human reading using pino-pretty.

Examples:
  $ jho logs                          # show all log entries, pretty
  $ jho logs --tail 50                # last 50 entries
  $ jho logs --json                   # raw JSON (for piping to jq)
  $ jho logs --path                   # print the log file path

Pipe through jq:
  $ jho logs --json | jq 'select(.level == 50)'    # only errors
  $ jho logs --json | jq -r '.msg'                  # just the messages

External alternative (uses pino-pretty directly):
  $ npx pino-pretty ~/.job-hunting-organizer/jho.log | less -R
`,
);
