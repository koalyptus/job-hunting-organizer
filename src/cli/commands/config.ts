import { Command } from 'commander';
import { loadGlobalConfig } from '../../core/config.js';
import { resolveConfigHome, resolveConfigPath } from '../../core/paths.js';
import { redactSecrets } from '../../core/config.view.js';
import { userInfo, userError } from '../output.js';

/**
 * `jho config [show|path]` — show or print the path of the global config.
 */
export const configCommand = new Command('config')
  .description('Show or print the path of the global config')
  .option('--reveal', 'show secrets in clear text (default: redacted)')
  .argument('[subcommand]', 'show or path', 'show')
  .action(function (subcommand, opts) {
    switch (subcommand) {
      case 'show': {
        const body = loadGlobalConfig();
        const value = opts.reveal ? body : redactSecrets(body);
        process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
        break;
      }
      case 'path': {
        process.stdout.write(`${resolveConfigPath(resolveConfigHome())}\n`);
        break;
      }
      case 'edit': {
        userInfo('jho config edit: not implemented yet');
        process.exit(1);
        break;
      }
      default:
        userError(`jho config: unknown subcommand: ${subcommand}`);
        process.exit(1);
    }
  });

configCommand.addHelpText(
  'after',
  `
Examples:
  $ jho config show              # redacted config
  $ jho config show --reveal     # show secrets
  $ jho config path              # print config file path
`,
);
