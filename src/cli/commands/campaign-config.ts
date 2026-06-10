import { Command } from 'commander';
import { loadCampaignConfig } from '../../core/config.js';
import { resolveCampaignRoot, resolveConfigPath } from '../../core/paths.js';
import { redactSecrets } from '../../core/config.view.js';
import type { GlobalOpts } from '../options.js';

/**
 * `jho campaign config [show|path]` — show or print the path of the
 * active campaign's config.
 */
export const campaignConfigCommand = new Command('config')
  .description("Show or print the path of the active campaign's config")
  .option('--reveal', 'show secrets in clear text (default: redacted)')
  .argument('[subcommand]', 'show or path', 'show')
  .action(function (subcommand, opts) {
    const globals = this.parent?.opts() as GlobalOpts | undefined;
    const campaign = globals?.campaign ?? 'default';
    switch (subcommand) {
      case 'show': {
        const body = loadCampaignConfig(campaign);
        const value = opts.reveal ? body : redactSecrets(body);
        process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
        break;
      }
      case 'path': {
        process.stdout.write(`${resolveConfigPath(resolveCampaignRoot(campaign))}\n`);
        break;
      }
      case 'edit': {
        process.stderr.write('jho campaign config edit: not implemented yet\n');
        process.exit(1);
      }
      default:
        process.stderr.write(`jho campaign config: unknown subcommand: ${subcommand}\n`);
        process.exit(1);
    }
  });

campaignConfigCommand.addHelpText(
  'after',
  `
Examples:
  $ jho campaign config show              # redacted campaign config
  $ jho campaign config show --reveal     # show secrets
  $ jho campaign config path              # print config file path
`,
);
