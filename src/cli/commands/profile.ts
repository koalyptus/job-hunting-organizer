import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { resolveCampaignRoot, resolveProfilePath } from '../../core/paths.js';
import type { GlobalOpts } from '../options.js';

/**
 * `jho profile show` — print the current profile.
 */
const showCommand = new Command('show')
  .description('Print the current profile')
  .action(function () {
    const globals = this.parent?.parent?.opts() as GlobalOpts | undefined;
    const campaign = globals?.campaign ?? 'default';
    const profilePath = resolveProfilePath(resolveCampaignRoot(campaign));
    try {
      const content = readFileSync(profilePath, 'utf8');
      process.stdout.write(content);
    } catch {
      process.stderr.write(
        `jho profile show: no profile found at ${profilePath}\nRun \`jho init\` to create one.\n`,
      );
      process.exit(1);
    }
  });

showCommand.addHelpText(
  'after',
  `
Examples:
  $ jho profile show                        # default campaign
  $ jho --campaign freelance profile show   # specific campaign
`,
);

/**
 * `jho profile rebuild` — regenerate profile from CV + GitHub (stub).
 */
const rebuildCommand = new Command('rebuild')
  .description('Regenerate profile from CV + GitHub')
  .option('--cv <path>', 'path to CV file')
  .option('--github <user>', 'GitHub username')
  .action(() => {
    process.stderr.write('jho profile rebuild: not implemented yet (planned: phase 4c)\n');
    process.exit(1);
  });

/**
 * `jho profile [show|rebuild]` — manage the candidate profile.
 */
export const profileCommand = new Command('profile')
  .description('Show or rebuild the candidate profile')
  .addCommand(showCommand)
  .addCommand(rebuildCommand);

profileCommand.addHelpText(
  'after',
  `
Examples:
  $ jho profile show         # print the profile
  $ jho profile rebuild      # regenerate from CV + GitHub
`,
);
