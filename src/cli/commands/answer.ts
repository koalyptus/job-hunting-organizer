import { Command } from 'commander';

/**
 * `jho answer [<slug>] "<question>"` — tailor an answer.
 * Slug is optional; inferred from cwd when omitted.
 */
export const answerCommand = new Command('answer')
  .description('Tailor an answer to a question (slug inferred from cwd if omitted)')
  .argument('[slug]', 'application slug (inferred from cwd if omitted)')
  .argument('[question]', 'question to answer (or use --stdin)')
  .option('--image <path>', 'include a screenshot or image')
  .option('--stdin', 'read the question from stdin')
  .action(() => {
    process.stderr.write('jho answer: not implemented yet (planned: phase 6)\n');
    process.exit(1);
  });

answerCommand.addHelpText(
  'after',
  `
The slug is optional. When omitted, it is inferred from the current directory
— run from inside an application folder (e.g. cd applied/<slug>) to skip it.

Examples:
  $ jho answer "Tell me about yourself"                      # infer slug from cwd
  $ jho answer 2026-Jan-15-frontend-acme-12345 "Why our company?"  # explicit slug
  $ jho answer --stdin < question.txt
  $ jho answer --image screenshot.png "What is this UI?"
  $ cd applied/2026-Jan-15-frontend-acme-12345 && jho answer "Tell me about yourself"
`,
);
