import { Command } from 'commander';
import { userOutput } from '../output.js';

/**
 * `jho help [<cmd>|<topic>]` — show help for a command or topic.
 */
export const helpCommand = new Command('help')
  .description('Show help for a command or topic')
  .argument('[subject]', 'command or topic to get help on')
  .action(function (subject: string | undefined) {
    const program = this.parent!;
    if (!subject) {
      program.help();
      return;
    }
    const cmd = program.commands.find((c) => c.name() === subject || c.aliases().includes(subject));
    if (cmd) {
      cmd.help();
      return;
    }
    // Topic help (not a command) - just show program help with a hint
    userOutput(`No command or topic named "${subject}" found.`);
    userOutput('Run `jho --help` to see all commands.');
    process.exit(1);
  });

helpCommand.addHelpText(
  'after',
  `
Examples:
  $ jho help                    # show all commands
  $ jho help track              # help for the track command
  $ jho help campaign           # help for the campaign topic
  $ jho help cover-letter       # help for cover-letter generation
  $ jho help natural-language   # help for the natural-language interface

Natural language: most commands can also be run in plain English, e.g.
  $ jho "list all applications for javascript-developer campaign"
  $ jho "create cover letter for application-xyz"
See 'jho help natural-language' for details.
`,
);
