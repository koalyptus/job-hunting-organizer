import { Command } from 'commander';

/**
 * `jho rename-campaign [<old>] <new>` — rename a campaign folder (stub, full impl in 4b).
 */
export const renameCampaignCommand = new Command('rename-campaign')
  .description('Rename a campaign folder')
  .argument('[old]', 'current campaign name (inferred from cwd if omitted)')
  .argument('[new]', 'new campaign name')
  .action(() => {
    process.stderr.write('jho rename-campaign: not implemented yet (planned: phase 4b)\n');
    process.exit(1);
  });

renameCampaignCommand.addHelpText(
  'after',
  `
Examples:
  $ jho rename-campaign freelance personal   # rename "freelance" → "personal"
  $ cd campaigns/freelance && jho rename-campaign personal  # infer old from cwd
`,
);
