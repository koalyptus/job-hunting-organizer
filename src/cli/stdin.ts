import { UserInputError } from './errors.js';

/**
 * Stdin utilities for CLI commands.
 */

/**
 * Read text from stdin. Throws {@link UserInputError} if stdin is empty or is a TTY.
 */
export async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new UserInputError('--stdin requires piped input (e.g. jho track --stdin < file.txt)');
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text || text.trim() === '') {
    throw new UserInputError('stdin is empty');
  }
  return text;
}
