import { Command } from 'commander';
import { resolveOldName, renameCampaign, RenameError } from '../../core/rename-campaign.js';
import { getRootLogger } from '../../core/logger/logger.js';
import type { Logger } from 'pino';

/**
 * `jho rename-campaign <new> [--from <old>]` — rename a campaign folder.
 */
export const renameCampaignCommand = new Command('rename-campaign')
  .description('Rename a campaign folder')
  .argument('<new>', 'new campaign name')
  .option('--from <old>', 'current campaign name (inferred from cwd if omitted)')
  .action(async function (new_: string, opts) {
    let log: Logger | undefined;
    try {
      const oldName = resolveOldName(opts.from as string | undefined);
      log = getRootLogger().child({ cmd: 'rename-campaign', old: oldName, new: new_ });
      await renameCampaign(oldName, new_);
      process.stdout.write(`Renamed campaign "${oldName}" → "${new_}"\n`);
    } catch (err) {
      if (err instanceof RenameError) {
        log?.error({ err }, 'rename-campaign.failed');
        process.stderr.write(`error: ${err.message}\n`);
        process.exit(1);
      }
      throw err;
    }
  });

renameCampaignCommand.addHelpText(
  'after',
  `
Rename a campaign folder. Validates the new name, acquires a lock,
and performs an atomic rename.

Examples:
  $ jho rename-campaign personal --from freelance    # rename "freelance" → "personal"
  $ cd campaigns/freelance && jho rename-campaign personal  # infer old from cwd
`,
);
