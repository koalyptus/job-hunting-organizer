import { Command } from 'commander';

/**
 * `jho interview [<slug>] <subcommand>` — manage the interview pipeline.
 * Slug is optional; inferred from cwd when omitted.
 */
const addCmd = new Command('add')
  .description('Add an interview entry')
  .requiredOption('--when <datetime>', 'interview date/time (e.g. "2026-06-15 10:00")')
  .option(
    '--type <type>',
    'interview type (hr, technical, system-design, behavioural, take-home, final, other)',
    'technical',
  )
  .requiredOption('--duration <minutes>', 'duration in minutes', '60')
  .option('--interviewer <name>', 'interviewer name')
  .option('--location <location>', 'interview location or link')
  .option('--provider <provider>', 'calendar provider (ics, outlook)', 'ics')
  .option('--title <title>', 'interview title')
  .action(() => {
    process.stderr.write('jho interview add: not implemented yet (planned: phase 7)\n');
    process.exit(1);
  });

const listCmd = new Command('list').description('List interviews for an application').action(() => {
  process.stderr.write('jho interview list: not implemented yet (planned: phase 7)\n');
  process.exit(1);
});

const markCmd = new Command('mark')
  .description('Mark the current interview status')
  .argument('<n>', 'interview number (from list)')
  .requiredOption('--status <status>', 'new status (passed, failed, no-show, rescheduled, pending)')
  .action(() => {
    process.stderr.write('jho interview mark: not implemented yet (planned: phase 7)\n');
    process.exit(1);
  });

const notesCmd = new Command('notes')
  .description('Add notes to an interview entry')
  .argument('<n>', 'interview number (from list)')
  .requiredOption('--append <text>', 'notes to append')
  .action(() => {
    process.stderr.write('jho interview notes: not implemented yet (planned: phase 7)\n');
    process.exit(1);
  });

/**
 * `jho interview [<slug>] <subcommand>` — manage the interview pipeline.
 */
export const interviewCommand = new Command('interview')
  .description('Manage the interview pipeline (slug inferred from cwd if omitted)')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .addCommand(addCmd)
  .addCommand(listCmd)
  .addCommand(markCmd)
  .addCommand(notesCmd);

interviewCommand.addHelpText(
  'after',
  `
The slug is optional on all subcommands. When omitted, it is inferred from
the current directory — run from inside an application folder to skip it.

Examples:
  $ jho interview add --when "2026-06-15 10:00" --type technical --duration 60
  $ jho interview add --when "2026-06-15 14:00" --interviewer "A. Smith" --location "Google Meet"
  $ jho interview list
  $ jho interview mark 1 --status passed
  $ jho interview mark 2 --status failed
  $ jho interview notes 1 --append "They asked about distributed systems"
  $ jho interview add my-app --when "2026-06-15 10:00"  # explicit slug
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho interview add --when "2026-06-15 10:00"
`,
);
