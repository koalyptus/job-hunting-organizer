import { Command } from 'commander';
import { getPackageVersion } from '../core/package.js';
import { globalOptions } from './options.js';
import { configCommand } from './commands/config.js';
import { campaignCommand } from './commands/campaign.js';
import { ownershipCommand } from './commands/ownership.js';
import { profileCommand } from './commands/profile.js';
import { initCommand } from './commands/init.js';
import { renameCampaignCommand } from './commands/rename-campaign.js';
import { trackCommand } from './commands/track.js';
import { listCommand } from './commands/list.js';
import { showCommand } from './commands/show.js';
import { coverLetterCommand } from './commands/cover-letter.js';
import { answerCommand } from './commands/answer.js';
import { interviewCommand } from './commands/interview.js';
import { retroCommand } from './commands/retro.js';
import { prepareCommand } from './commands/prepare.js';
import { doctorCommand } from './commands/doctor.js';
import { repairCommand } from './commands/repair.js';
import { statsCommand } from './commands/stats.js';
import { helpCommand } from './commands/help.js';
import { mcpCommand } from './commands/mcp.js';

const VERSION = getPackageVersion();

const program = new Command('jho')
  .version(VERSION)
  .description('Local-first CLI for running a job-hunting campaign');

// Global options
for (const opt of globalOptions) {
  program.addOption(opt);
}

// Register all commands
program.addCommand(configCommand);
program.addCommand(campaignCommand);
program.addCommand(ownershipCommand);
program.addCommand(profileCommand);
program.addCommand(initCommand);
program.addCommand(renameCampaignCommand);
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
program.addCommand(helpCommand);
program.addCommand(mcpCommand);

program.addHelpText(
  'after',
  `
Data locations (override via env var only):
  $JHO_CONFIG_HOME       Override the global config home (default: ~/.job-hunting-organizer/)
  $JHO_DATA              Override the campaign data root (default: ~/job-hunting-organizer-data/)

Per-command global flags (--campaign, --verbose, --quiet, --yes, --no-color, --log-file)
are available on all commands.
`,
);

program.parse();
