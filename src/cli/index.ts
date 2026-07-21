import { Command } from 'commander';
import { getPackageVersion } from '../core/package.js';
import { globalOptions } from './options.js';
import { configCommand } from './commands/config.js';
import { campaignCommand } from './commands/campaign.js';
import { ownershipCommand } from './commands/ownership.js';
import { profileCommand } from './commands/profile.js';
import { initCommand } from './commands/init.js';
import { kbCommand } from './commands/kb.js';
import { renameCampaignCommand } from './commands/rename-campaign.js';
import { removeCampaignCommand } from './commands/remove-campaign.js';
import { removeApplicationCommand } from './commands/remove-application.js';
import { renameApplicationCommand } from './commands/rename-application.js';
import { trackCommand } from './commands/track.js';
import { listCommand } from './commands/list.js';
import { showCommand } from './commands/show.js';
import { coverLetterCommand } from './commands/cover-letter.js';
import { answerCommand } from './commands/answer.js';
import { interviewCommand } from './commands/interview.js';
import { retroCommand } from './commands/retro.js';
import { confirm } from '@clack/prompts';
import { prepareCommand } from './commands/prepare.js';
import { doctorCommand } from './commands/doctor.js';
import { repairCommand } from './commands/repair.js';
import { statsCommand } from './commands/stats.js';
import { logsCommand } from './commands/logs.js';
import { helpCommand } from './commands/help.js';
import { mcpCommand } from './commands/mcp.js';
import { initRootLogger } from '../core/logger/root-logger.js';
import { getRootLogger, logError } from '../core/logger/logger.js';
import { loadGlobalConfig } from '../core/config/config.js';
import { initColors } from './colors.js';
import { withSpinner } from '../core/spinner.js';
import {
  looksLikeNaturalLanguage,
  deriveKnownCommands,
  extractPromptAndGlobals,
  parseNaturalLanguage,
  PromptParseError,
} from '../core/parser/prompt-parser.js';
import { dispatchNaturalLanguage, validateParsedCommand } from './nl-dispatch.js';
import { userError, userOutput } from './output.js';

const VERSION = getPackageVersion();

initRootLogger();

const log = getRootLogger();
log.info({ args: process.argv.slice(2) }, 'cli.start');

const program = new Command('jho')
  .version(VERSION)
  .description('Local-first CLI for running a AI assisted job-hunting campaign');

// Global options
for (const opt of globalOptions) {
  program.addOption(opt);
}

// Initialise colour support before any command action runs
program.hook('preAction', (thisCommand) => {
  const globals = thisCommand.opts<{ color?: boolean }>();
  const configColor = loadGlobalConfig().color;
  initColors(globals.color, configColor);
});

// Register all commands
program.addCommand(configCommand);
program.addCommand(campaignCommand);
program.addCommand(ownershipCommand);
program.addCommand(profileCommand);
program.addCommand(initCommand);
program.addCommand(kbCommand);
program.addCommand(renameCampaignCommand);
program.addCommand(removeCampaignCommand);
program.addCommand(removeApplicationCommand);
program.addCommand(renameApplicationCommand);
program.addCommand(trackCommand);
program.addCommand(listCommand);
program.addCommand(showCommand);
program.addCommand(coverLetterCommand);
program.addCommand(answerCommand);
program.addCommand(interviewCommand);
program.addCommand(retroCommand);
program.addCommand(prepareCommand);
program.addCommand(doctorCommand);
program.addCommand(repairCommand);
program.addCommand(statsCommand);
program.addCommand(logsCommand);
program.addCommand(helpCommand);
program.addCommand(mcpCommand);

program.addHelpText(
  'after',
  `
Data locations (override via env var only):
  $JHO_CONFIG_HOME        Override the global config home (default: ~/.job-hunting-organizer/)
  $JHO_DATA               Override the campaign data root (default: ~/job-hunting-organizer-data/)
  $JHO_DEFAULT_CAMPAIGN   Override the default campaign name (default: "default")

LLM configuration (override via env var; falls back to campaign config):
  $LLM_BASE_URL           LLM API base URL
  $LLM_API_KEY            LLM API key
  $LLM_MODEL              LLM model identifier

Logging:
  $JHO_LOG_LEVEL          Override log level (default: from config)
  $JHO_LOG_FILE           Override log file path (default: <configHome>/jho.log)

Init wizard pre-fills:
  $JHO_CV_PATH            Pre-fill CV path
  $JHO_LINKEDIN_URL       Pre-fill LinkedIn profile URL
  $JHO_KB_PATH            Pre-fill knowledge base path

Advanced:
  $JHO_URL_PATTERNS       Custom job-ID extraction patterns (JSON array)
  $NO_COLOR               Disable ANSI color output (standard)

Per-command global flags (--campaign, --verbose, --quiet, --yes, --no-color, --log-file)
are available on all commands.

Natural language: you can also invoke commands using plain English, e.g.
  $ jho "list all applications for javascript-developer campaign"
  $ jho "create cover letter for application-xyz"
`,
);

// ── Natural language routing ───────────────────────────────────────────────
// If the first argument looks like natural language (contains spaces and is
// not a known subcommand), parse it via the LLM and dispatch to the matching
// command by re-parsing a synthetic argv through the existing program.
const rawArgs = process.argv.slice(2);

if (looksLikeNaturalLanguage(rawArgs, deriveKnownCommands(program.commands.map((c) => c.name())))) {
  // Prevent Commander from calling process.exit on parse errors during the
  // synthetic re-parse below — we want to surface errors as user-facing text.
  program.exitOverride();

  const { globals, prompt } = extractPromptAndGlobals(rawArgs);
  const cmdLog = getRootLogger().child({ module: 'nl-route' });

  try {
    const parsed = await withSpinner('Interpreting command...', 'Command interpreted', () =>
      parseNaturalLanguage(prompt, globals, cmdLog),
    );

    // Validate command against registered commands
    validateParsedCommand(parsed, program);

    // Low confidence (0.5–0.8): echo the parse and require confirmation
    // unless --yes was passed.
    if (parsed.confidence < 0.8 && !globals.yes) {
      const summary =
        `${parsed.command}` +
        `${parsed.subcommand ? ` ${parsed.subcommand}` : ''}` +
        `${parsed.args.length ? ` ${parsed.args.join(' ')}` : ''}` +
        ` (confidence ${parsed.confidence.toFixed(2)})`;
      userOutput(`Interpreted as: ${summary}`);
      const proceed = await confirm({
        message: 'Run this command?',
        initialValue: parsed.confidence >= 0.5,
      });
      if (!proceed) {
        userOutput('Cancelled.');
        process.exit(0);
      }
    } else if (parsed.confidence < 0.5) {
      userError(
        `Could not confidently interpret: "${prompt}"\n` +
          `Interpreted as: ${parsed.command}${parsed.subcommand ? ` ${parsed.subcommand}` : ''} ` +
          `${parsed.args.join(' ')} (confidence ${parsed.confidence.toFixed(2)})\n` +
          `Hint: rephrase, or run a specific command (see 'jho help').`,
      );
      process.exit(1);
    }

    await dispatchNaturalLanguage(parsed, globals, program, cmdLog);
  } catch (err) {
    if (err instanceof PromptParseError) {
      logError(cmdLog, err, 'nl-route.failed');
      cmdLog.flush();
      const hint = err.message.startsWith('LLM call failed')
        ? '\nHint: natural-language parsing requires an LLM. ' +
          "Configure one with 'jho init' or set LLM_* env vars. " +
          "Alternatively run a specific command (see 'jho help')."
        : '';
      userError(`${err.message}${hint}`);
      process.exit(1);
    }
    throw err;
  }
} else {
  program.parse();
}
